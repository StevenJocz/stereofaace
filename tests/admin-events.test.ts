import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { artists, genres, users } from "@/db/schema";
import { listUpcomingEvents } from "@/modules/events/service";
import {
  createEvent,
  deleteEvent,
  getEventAdmin,
  listEventsAdmin,
  restoreEvent,
  setEventStatus,
  updateEvent,
} from "@/modules/events/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
let a1: string;
let a2: string;
let genreId: string;
const day = 24 * 3600 * 1000;
const future = (d: number) => new Date(Date.now() + d * day);

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const base = (over: Record<string, unknown> = {}) => ({
  name: "Festival Prueba",
  kind: "festival",
  startsAt: future(10),
  city: "Bogotá",
  country: "CO",
  ...over,
});
const upcomingIds = async () => (await listUpcomingEvents(h.db, { limit: 100 })).map((e) => e.id);

beforeAll(async () => {
  h = await makeDb();
  editor = await mkUser("editor", "ed");
  redactor = await mkUser("redactor", "red");
  const rows = await h.db
    .insert(artists)
    .values([
      { slug: "uno", name: "Uno" },
      { slug: "dos", name: "Dos" },
    ])
    .returning();
  [a1, a2] = rows.map((r) => r.id);
  [{ id: genreId }] = await h.db.insert(genres).values({ slug: "techno", name: "Techno", family: "electronica" }).returning();
});
afterAll(async () => {
  await h.close();
});

describe("agenda (administración)", () => {
  it("rechaza un fin anterior al inicio y un país en minúsculas", async () => {
    await expect(createEvent(h.db, editor, base({ endsAt: future(9) }))).rejects.toBeInstanceOf(ZodError);
    await expect(createEvent(h.db, editor, base({ country: "co" }))).rejects.toBeInstanceOf(ZodError);
  });

  it("guarda artistas en orden, género y enlace de entradas", async () => {
    const { id } = await createEvent(
      h.db,
      editor,
      base({ name: "Con cartel", artistIds: [a2, a1], genreId, ticketUrl: "https://tickets.example.org/e" }),
    );
    const e = await getEventAdmin(h.db, editor, id);
    expect(e?.artistIds).toEqual([a2, a1]);
    expect(e).toMatchObject({ genreId, ticketUrl: "https://tickets.example.org/e" });
  });

  it("slugs repetidos reciben sufijo", async () => {
    const a = await createEvent(h.db, editor, base({ name: "Mismo evento" }));
    const b = await createEvent(h.db, editor, base({ name: "Mismo evento" }));
    expect([a.slug, b.slug]).toEqual(["mismo-evento", "mismo-evento-2"]);
  });

  it("solo el publicado y futuro sale en la portada", async () => {
    const draft = await createEvent(h.db, editor, base({ name: "Borrador", status: "draft" }));
    const cancelled = await createEvent(h.db, editor, base({ name: "Cancelado", status: "cancelled" }));
    const past = await createEvent(h.db, editor, base({ name: "Pasado", status: "published", startsAt: future(-5) }));
    const live = await createEvent(h.db, editor, base({ name: "Vigente", status: "published" }));
    const ids = await upcomingIds();
    expect(ids).toContain(live.id);
    for (const x of [draft, cancelled, past]) expect(ids).not.toContain(x.id);
    await setEventStatus(h.db, editor, live.id, "cancelled");
    expect(await upcomingIds()).not.toContain(live.id);
  });

  it("un redactor guarda borradores pero no publica ni cancela", async () => {
    const { id } = await createEvent(h.db, redactor, base({ name: "De redactor" }));
    await expect(setEventStatus(h.db, redactor, id, "published")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createEvent(h.db, redactor, base({ name: "Directo", status: "published" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateEvent(h.db, redactor, id, base({ status: "cancelled" }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("el borrado es lógico y se puede restaurar", async () => {
    const { id } = await createEvent(h.db, editor, base({ name: "Efímero", status: "published" }));
    await deleteEvent(h.db, editor, id);
    expect(await upcomingIds()).not.toContain(id);
    expect((await listEventsAdmin(h.db, editor, {})).items.map((e) => e.id)).not.toContain(id);
    await restoreEvent(h.db, editor, id);
    expect(await upcomingIds()).toContain(id);
  });

  it("filtra por estado, próximos y texto", async () => {
    const drafts = await listEventsAdmin(h.db, editor, { status: "draft" });
    expect(drafts.items.length).toBeGreaterThan(0);
    expect(drafts.items.every((e) => e.status === "draft")).toBe(true);
    const upcoming = await listEventsAdmin(h.db, editor, { upcoming: true });
    expect(upcoming.items.every((e) => e.startsAt >= new Date())).toBe(true);
    expect((await listEventsAdmin(h.db, editor, { search: "pasado" })).items.map((e) => e.name)).toEqual(["Pasado"]);
  });
});
