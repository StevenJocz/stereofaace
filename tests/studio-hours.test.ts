import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { studioCarts, studioEvents, users } from "@/db/schema";
import { HOUR_EVENT_PREFIX, listEvents, saveHourEvents } from "@/modules/studio/events";
import { eventsHoursHandler } from "@/modules/studio/data-http";
import { HOUR_PREFIX, guessHourCart, hourEventName, parseHourEvent } from "@/ui/studio/engine/hours";
import { makeDb } from "./helpers";

describe("nombres de los eventos de la hora", () => {
  it("el prefijo del cliente coincide con el del servidor", () => {
    expect(HOUR_PREFIX).toBe(HOUR_EVENT_PREFIX);
  });
  it("se arman y se leen de vuelta", () => {
    expect(hourEventName(7)).toBe("Hora · 07:00");
    expect(hourEventName(14, 30)).toBe("Hora · 14:30");
    expect(parseHourEvent("Hora · 14:30")).toEqual({ hour: 14, minute: 30 });
    expect(parseHourEvent("Hora · 25:00")).toBeNull();
    expect(parseHourEvent("Hora en punto")).toBeNull();
    expect(parseHourEvent("hora · 14:00")).toBeNull();
  });
});

describe("autoasignar el jingle de cada hora por su nombre", () => {
  const carts = [
    { id: "a", name: "StereoFace Radio" },
    { id: "b", name: "Son las 2 PM" },
    { id: "c", name: "14:00 hora" },
    { id: "d", name: "Hora 9" },
    { id: "e", name: "Las 22 horas" },
    { id: "f", name: "12 am medianoche" },
    { id: "g", name: "Cortina 12" },
    { id: "h", name: "Son las 11 a.m." },
    { id: "i", name: "Hora 21h00" },
  ];
  it("reconoce 14:00, 2 pm, hora 9, 22 horas, 11 a.m. y 21h00", () => {
    expect(guessHourCart(carts, 14)).toBe("c"); // 14:00 gana a «2 pm» (patrón más preciso)
    expect(guessHourCart(carts, 9)).toBe("d");
    expect(guessHourCart(carts, 22)).toBe("e");
    expect(guessHourCart(carts, 11)).toBe("h");
    expect(guessHourCart(carts, 21)).toBe("i");
    expect(guessHourCart(carts, 0)).toBe("f");
  });
  it("usa «2 pm» cuando no hay otro nombre para esa hora", () => {
    expect(guessHourCart(carts.filter((c) => c.id !== "c"), 14)).toBe("b");
  });
  it("no confunde números parciales ni nombres sin hora", () => {
    expect(guessHourCart(carts, 2)).toBeNull(); // «Cortina 12» no es la hora 2
    expect(guessHourCart(carts, 12)).toBeNull(); // ni «12 am» es el mediodía (es pm)
    expect(guessHourCart([{ id: "x", name: "Promo 1" }], 1)).toBeNull();
    expect(guessHourCart([], 5)).toBeNull();
  });
});

describe("guardar los anuncios de la hora", () => {
  let h: DbHandle;
  let dj1: Actor;
  let dj2: Actor;
  let admin: Actor;
  let redactor: Actor;
  let c1: string;
  let c2: string;
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };
  const names = async () => (await h.db.select().from(studioEvents)).map((e) => e.name).sort();

  beforeAll(async () => {
    h = await makeDb();
    dj1 = await mk("locutor", "dj1");
    dj2 = await mk("locutor", "dj2");
    admin = await mk("admin", "adm");
    redactor = await mk("redactor", "red");
    const base = { mime: "audio/mpeg", bytes: 10, kind: "id" as const };
    [{ id: c1 }] = await h.db.insert(studioCarts).values({ ...base, name: "Hora 8", storageKey: "h8", durationSec: 3 }).returning({ id: studioCarts.id });
    [{ id: c2 }] = await h.db.insert(studioCarts).values({ ...base, name: "Hora 9", storageKey: "h9", durationSec: 4 }).returning({ id: studioCarts.id });
  });
  afterAll(() => h.close());

  it("crea un evento por hora con su jingle, en el modo y los días elegidos", async () => {
    const r = await saveHourEvents(h.db, dj1, { mode: "fixed", transition: "cut", minute: 0, days: [1, 2, 3, 4, 5], hours: [{ hour: 8, cartId: c1 }, { hour: 9, cartId: c2 }, { hour: 10, cartId: null }] });
    expect(r).toEqual({ created: 2, updated: 0, removed: 0, skipped: [] });
    const list = await listEvents(h.db, dj1);
    const e8 = list.find((e) => e.name === "Hora · 08:00")!;
    expect(e8).toMatchObject({ time: "08:00", mode: "fixed", transition: "cut", days: [1, 2, 3, 4, 5], active: true, mine: true });
    expect(e8.items).toEqual([{ kind: "cart", cartId: c1, name: "Hora 8", durationSec: 3 }]);
  });

  it("guardar de nuevo actualiza (también si cambia el minuto) sin duplicar", async () => {
    const r = await saveHourEvents(h.db, dj1, { mode: "delayed", minute: 30, days: [1, 2, 3, 4, 5, 6, 7], hours: [{ hour: 8, cartId: c2 }, { hour: 9, cartId: c2 }] });
    expect(r).toEqual({ created: 0, updated: 2, removed: 0, skipped: [] });
    expect(await names()).toEqual(["Hora · 08:30", "Hora · 09:30"]);
    const e = (await listEvents(h.db, dj1)).find((x) => x.name === "Hora · 08:30")!;
    expect(e).toMatchObject({ time: "08:30", mode: "delayed", days: [1, 2, 3, 4, 5, 6, 7] });
    expect(e.items[0]).toMatchObject({ cartId: c2, name: "Hora 9" });
  });

  it("una hora sin audio pierde su evento", async () => {
    const r = await saveHourEvents(h.db, dj1, { minute: 30, days: [1], hours: [{ hour: 8, cartId: null }, { hour: 9, cartId: c2 }] });
    expect(r).toMatchObject({ created: 0, updated: 1, removed: 1 });
    expect(await names()).toEqual(["Hora · 09:30"]);
  });

  it("otro locutor no cambia ni quita lo ajeno (se avisa); el administrador sí", async () => {
    const r = await saveHourEvents(h.db, dj2, { minute: 30, days: [1], hours: [{ hour: 9, cartId: c1 }] });
    expect(r).toEqual({ created: 0, updated: 0, removed: 0, skipped: ["Hora · 09:30"] });
    const q = await saveHourEvents(h.db, dj2, { minute: 30, days: [1], hours: [{ hour: 9, cartId: null }] });
    expect(q.skipped).toEqual(["Hora · 09:30"]);
    expect(await names()).toEqual(["Hora · 09:30"]);
    const a = await saveHourEvents(h.db, admin, { minute: 0, days: [1], hours: [{ hour: 9, cartId: c1 }] });
    expect(a).toMatchObject({ updated: 1 });
    expect(await names()).toEqual(["Hora · 09:00"]);
  });

  it("no toca los eventos que no son de la hora", async () => {
    await h.db.insert(studioEvents).values({ name: "Promo del programa", minuteOfDay: 600, days: [1], items: [], createdBy: dj1.id });
    await saveHourEvents(h.db, admin, { minute: 0, days: [1], hours: [{ hour: 9, cartId: null }] });
    expect(await names()).toEqual(["Promo del programa"]);
    await h.db.delete(studioEvents).where(eq(studioEvents.name, "Promo del programa"));
  });

  it("valida los datos y los permisos", async () => {
    await expect(saveHourEvents(h.db, redactor, { minute: 0, days: [1], hours: [] })).rejects.toThrow(ForbiddenError);
    await expect(saveHourEvents(h.db, dj1, { minute: 60, days: [1], hours: [] })).rejects.toThrow(ZodError);
    await expect(saveHourEvents(h.db, dj1, { minute: 0, days: [], hours: [] })).rejects.toThrow(ZodError);
    await expect(saveHourEvents(h.db, dj1, { minute: 0, days: [1], hours: [{ hour: 24, cartId: c1 }] })).rejects.toThrow(ZodError);
    await expect(saveHourEvents(h.db, dj1, { minute: 0, days: [1], hours: [{ hour: 3, cartId: c1 }, { hour: 3, cartId: c2 }] })).rejects.toThrow(/repetida/);
    await expect(saveHourEvents(h.db, dj1, { minute: 0, days: [1], hours: [{ hour: 3, cartId: "00000000-0000-4000-8000-000000000000" }] })).rejects.toThrow(/ya no existe/);
    expect(await names()).toEqual([]); // la transacción deshace lo que no terminó
  });

  it("respuesta HTTP: 401, 403, 400 y 200", async () => {
    expect((await eventsHoursHandler(h.db, null, {})).status).toBe(401);
    expect((await eventsHoursHandler(h.db, redactor, { minute: 0, days: [1], hours: [] })).status).toBe(403);
    expect((await eventsHoursHandler(h.db, dj1, null)).status).toBe(400);
    expect((await eventsHoursHandler(h.db, dj1, { minute: 99, days: [1], hours: [] })).status).toBe(400);
    const ok = await eventsHoursHandler(h.db, dj1, { minute: 0, days: [1, 2], hours: [{ hour: 6, cartId: c1 }] });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ created: 1, updated: 0, removed: 0, skipped: [] });
  });
});
