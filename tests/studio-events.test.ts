import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { auditLogs, studioCarts, studioEvents, users } from "@/db/schema";
import { createEvent, deleteEvent, listEvents, minuteToTime, timeToMinute, updateEvent, type EventInput } from "@/modules/studio/events";
import { eventsCreateHandler, eventsDeleteHandler, eventsListHandler, eventsUpdateHandler } from "@/modules/studio/data-http";
import { makeDb } from "./helpers";

let h: DbHandle;
let dj1: Actor;
let dj2: Actor;
let admin: Actor;
let redactor: Actor;
let cartId: string;
let deletedCartId: string;

const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
const base = (over: Partial<EventInput> = {}): EventInput => ({
  name: "Hora en punto",
  time: "14:00",
  days: [1, 2, 3, 4, 5],
  mode: "delayed",
  items: [{ kind: "cart", cartId }],
  ...over,
});

beforeAll(async () => {
  h = await makeDb();
  dj1 = await mk("locutor", "dj1");
  dj2 = await mk("locutor", "dj2");
  admin = await mk("admin", "adm");
  redactor = await mk("redactor", "red");
  const cart = { mime: "audio/mpeg", bytes: 1000, kind: "jingle" as const };
  [{ id: cartId }] = await h.db.insert(studioCarts).values({ ...cart, name: "Jingle de apertura", storageKey: "k1", durationSec: 3.4 }).returning({ id: studioCarts.id });
  [{ id: deletedCartId }] = await h.db.insert(studioCarts).values({ ...cart, name: "Borrado", storageKey: "k2", deletedAt: new Date() }).returning({ id: studioCarts.id });
});
afterAll(async () => {
  await h.close();
});

describe("hora del evento", () => {
  it("convierte HH:MM a minutos y de vuelta", () => {
    expect(timeToMinute("00:00")).toBe(0);
    expect(timeToMinute("14:05")).toBe(845);
    expect(timeToMinute("23:59")).toBe(1439);
    expect(minuteToTime(845)).toBe("14:05");
    expect(minuteToTime(0)).toBe("00:00");
  });
});

describe("crear y leer eventos", () => {
  it("guarda un evento con un jingle y lo devuelve con nombre y duración del cart", async () => {
    const ev = await createEvent(h.db, dj1, base({ items: [{ kind: "cart", cartId }, { kind: "file", azId: "42", title: "Promo Roma", artist: "", durationSec: 45.4 }] }));
    expect(ev).toMatchObject({ name: "Hora en punto", time: "14:00", minuteOfDay: 840, days: [1, 2, 3, 4, 5], mode: "delayed", transition: "fade", active: true, mine: true, canEdit: true });
    expect(ev.items).toEqual([
      { kind: "cart", cartId, name: "Jingle de apertura", durationSec: 3.4 },
      { kind: "file", azId: "42", title: "Promo Roma", artist: "", durationSec: 45.4 },
    ]);
    const list = await listEvents(h.db, dj2);
    const seen = list.find((e) => e.id === ev.id)!;
    expect(seen).toMatchObject({ mine: false, canEdit: false });
  });

  it("la lista sale ordenada por hora", async () => {
    await createEvent(h.db, admin, base({ name: "Temprano", time: "06:30" }));
    await createEvent(h.db, admin, base({ name: "Tarde", time: "23:15" }));
    const times = (await listEvents(h.db, admin)).map((e) => e.time);
    expect(times).toEqual([...times].sort());
  });

  it("normaliza los días (sin repetir y en orden) y acepta Fijo con corte", async () => {
    const ev = await createEvent(h.db, dj1, base({ days: [7, 1, 7, 3], mode: "fixed", transition: "cut" }));
    expect(ev.days).toEqual([1, 3, 7]);
    expect(ev).toMatchObject({ mode: "fixed", transition: "cut" });
  });

  it("lo guarda en la base y deja constancia en la auditoría", async () => {
    const ev = await createEvent(h.db, dj1, base({ name: "Auditado" }));
    expect((await h.db.select().from(studioEvents).where(eq(studioEvents.id, ev.id)))[0].createdBy).toBe(dj1.id);
    const logs = await h.db.select().from(auditLogs).where(eq(auditLogs.entityId, ev.id));
    expect(logs.map((l) => l.action)).toContain("studio.event.create");
  });
});

describe("validación", () => {
  const bad = async (over: Partial<EventInput>, msg: RegExp) => {
    const err = await createEvent(h.db, dj1, base(over)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ZodError);
    expect((err as ZodError).issues.map((i) => i.message).join(" | ")).toMatch(msg);
  };
  it("rechaza hora mal escrita, sin días, sin nombre y sin audios", async () => {
    await bad({ time: "25:00" }, /HH:MM/);
    await bad({ time: "9:00" }, /HH:MM/);
    await bad({ days: [] }, /al menos un día/);
    await bad({ days: [0, 8] }, /./);
    await bad({ name: "   " }, /nombre/);
    await bad({ items: [] }, /al menos un audio/);
  });
  it("rechaza ids de pista o de jingle que no son válidos", async () => {
    await bad({ items: [{ kind: "file", azId: "../x", title: "mal", artist: "", durationSec: null }] }, /no válida/);
    await bad({ items: [{ kind: "cart", cartId: "no-es-uuid" }] }, /no válido/);
  });
  it("un jingle borrado o inexistente no se puede usar", async () => {
    await expect(createEvent(h.db, dj1, base({ items: [{ kind: "cart", cartId: deletedCartId }] }))).rejects.toThrow(/jingles del evento ya no existe/);
    await expect(createEvent(h.db, dj1, base({ items: [{ kind: "cart", cartId: "00000000-0000-4000-8000-000000000000" }] }))).rejects.toThrow(/ya no existe/);
  });
  it("tope de audios por evento", async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ kind: "file" as const, azId: String(i + 1), title: `T${i}`, artist: "", durationSec: 10 }));
    await bad({ items: many }, /hasta 50/);
  });
});

describe("permisos", () => {
  it("sin permiso de estudio no se lee ni se crea", async () => {
    await expect(listEvents(h.db, redactor)).rejects.toThrow(ForbiddenError);
    await expect(createEvent(h.db, redactor, base())).rejects.toThrow(ForbiddenError);
    await expect(listEvents(h.db, null)).rejects.toThrow(ForbiddenError);
  });

  it("otro locutor no cambia ni borra un evento ajeno; el administrador sí", async () => {
    const ev = await createEvent(h.db, dj1, base({ name: "De dj1" }));
    await expect(updateEvent(h.db, dj2, ev.id, base({ name: "Cambiado" }))).rejects.toThrow(ForbiddenError);
    await expect(deleteEvent(h.db, dj2, ev.id)).rejects.toThrow(ForbiddenError);
    expect((await updateEvent(h.db, admin, ev.id, base({ name: "Por el admin" }))).name).toBe("Por el admin");
    await deleteEvent(h.db, admin, ev.id);
    expect((await listEvents(h.db, admin)).some((e) => e.id === ev.id)).toBe(false);
  });

  it("su autor edita y borra el suyo", async () => {
    const ev = await createEvent(h.db, dj1, base({ name: "Mío" }));
    const upd = await updateEvent(h.db, dj1, ev.id, base({ name: "Mío v2", time: "15:30", active: false, mode: "fixed" }));
    expect(upd).toMatchObject({ name: "Mío v2", time: "15:30", active: false, mode: "fixed" });
    await deleteEvent(h.db, dj1, ev.id);
    await expect(deleteEvent(h.db, dj1, ev.id)).rejects.toThrow(/ya no existe/);
    await expect(updateEvent(h.db, dj1, "no-uuid", base())).rejects.toThrow(/ya no existe/);
  });
});

describe("respuestas HTTP", () => {
  it("sin sesión 401, sin permiso 403 y cuerpo roto 400", async () => {
    expect((await eventsListHandler(h.db, null)).status).toBe(401);
    expect((await eventsListHandler(h.db, redactor)).status).toBe(403);
    expect((await eventsCreateHandler(h.db, dj1, null)).status).toBe(400);
    const bad = await eventsCreateHandler(h.db, dj1, { name: "x" });
    expect(bad.status).toBe(400);
  });

  it("crea (201), actualiza, lista y borra", async () => {
    const created = await eventsCreateHandler(h.db, dj1, base({ name: "Por HTTP" }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const upd = await eventsUpdateHandler(h.db, dj1, id, base({ name: "Por HTTP 2" }));
    expect(((await upd.json()) as { name: string }).name).toBe("Por HTTP 2");
    const listed = (await (await eventsListHandler(h.db, dj1)).json()) as { id: string }[];
    expect(listed.some((e) => e.id === id)).toBe(true);
    expect((await eventsDeleteHandler(h.db, dj2, id)).status).toBe(403);
    expect((await eventsDeleteHandler(h.db, dj1, id)).status).toBe(200);
  });
});
