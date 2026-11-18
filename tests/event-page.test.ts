import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { artists, genres, media, users } from "@/db/schema";
import { createEvent, deleteEvent, getEventAdmin, setEventStatus, updateEvent } from "@/modules/events/admin";
import { getEventPage, listEventSlugs, listUpcomingEvents } from "@/modules/events/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let a1: string;
let genreId: string;
let m: string[];
const day = 24 * 3600 * 1000;
const future = (d: number) => new Date(Date.now() + d * day);
const base = (over: Record<string, unknown> = {}) => ({ name: "Festival Uno", kind: "festival", startsAt: future(10), city: "Bogotá", country: "CO", status: "published", ...over });

beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "ed@example.com", name: "ed", role: "editor" }).returning();
  editor = { id: u.id, role: u.role };
  [{ id: a1 }] = await h.db.insert(artists).values({ slug: "uno", name: "Uno" }).returning();
  [{ id: genreId }] = await h.db.insert(genres).values({ slug: "techno", name: "Techno", family: "electronica" }).returning();
  const rows = await h.db
    .insert(media)
    .values([1, 2, 3].map((i) => ({ storageKey: `eventos/img-${i}.jpg`, mime: "image/jpeg", bytes: 1000, alt: `Imagen ${i}`, credit: "Organizador" })))
    .returning();
  m = rows.map((r) => r.id);
});
afterAll(() => h.close());

describe("ficha pública del evento", () => {
  it("trae imagen principal, galería en orden, cartel, género y datos del lugar", async () => {
    const { slug } = await createEvent(h.db, editor, base({ venue: "Movistar Arena", description: "Primer párrafo.\n\nSegundo.", genreId, artistIds: [a1], imageId: m[0], galleryIds: [m[2], m[1]], ticketUrl: "https://tickets.example.com/x" }));
    const e = await getEventPage(h.db, slug);
    expect(e).toMatchObject({ name: "Festival Uno", venue: "Movistar Arena", genre: "Techno", imageUrl: "/media/eventos/img-1.jpg", cancelled: false, past: false, ticketUrl: "https://tickets.example.com/x" });
    expect(e!.imageCredit).toMatchObject({ alt: "Imagen 1", credit: "Organizador" });
    expect(e!.gallery.map((g) => g.url)).toEqual(["/media/eventos/img-3.jpg", "/media/eventos/img-2.jpg"]);
    expect(e!.lineup.map((l) => l.name)).toEqual(["Uno"]);
    expect(e!.description).toContain("Segundo.");
  });

  it("sin imagen subida, imageUrl es null (se usa la ilustración generativa)", async () => {
    const { slug } = await createEvent(h.db, editor, base({ name: "Sin Imagen", coverArt: { scene: "dj", tone: "violet", seed: 3 } }));
    const e = await getEventPage(h.db, slug);
    expect(e!.imageUrl).toBeNull();
    expect(e!.coverArt).toMatchObject({ scene: "dj" });
  });

  it("la lista de próximos incluye la imagen principal (para el evento destacado de la portada)", async () => {
    await createEvent(h.db, editor, base({ name: "Con Foto Pronto", startsAt: future(1), imageId: m[1] }));
    const list = await listUpcomingEvents(h.db, { limit: 50 });
    expect(list[0]).toMatchObject({ name: "Con Foto Pronto", imageUrl: "/media/eventos/img-2.jpg" });
  });

  it("borradores y eventos borrados no existen para el público; los cancelados se muestran como cancelados", async () => {
    const draft = await createEvent(h.db, editor, base({ name: "Borrador", status: "draft" }));
    expect(await getEventPage(h.db, draft.slug)).toBeNull();
    const del = await createEvent(h.db, editor, base({ name: "Borrado" }));
    await deleteEvent(h.db, editor, del.id);
    expect(await getEventPage(h.db, del.slug)).toBeNull();
    const canc = await createEvent(h.db, editor, base({ name: "Cancelado" }));
    await setEventStatus(h.db, editor, canc.id, "cancelled");
    expect(await getEventPage(h.db, canc.slug)).toMatchObject({ cancelled: true });
    expect(await getEventPage(h.db, "no-existe")).toBeNull();
    expect(await getEventPage(h.db, "../etc")).toBeNull();
  });

  it("un evento ya pasado se marca como pasado", async () => {
    const { slug } = await createEvent(h.db, editor, base({ name: "Viejo", startsAt: future(-5) }));
    expect(await getEventPage(h.db, slug)).toMatchObject({ past: true });
  });

  it("«más en la agenda» muestra otros próximos de la misma ciudad o género, sin repetir el mismo", async () => {
    const a = await createEvent(h.db, editor, base({ name: "Origen Mde", city: "Medellín", startsAt: future(3) }));
    const b = await createEvent(h.db, editor, base({ name: "Vecino Mde", city: "Medellín", startsAt: future(4) }));
    const e = await getEventPage(h.db, a.slug);
    expect(e!.related.map((r) => r.name)).toContain("Vecino Mde");
    expect(e!.related.map((r) => r.id)).not.toContain(a.id);
    void b;
  });

  it("el administrador puede cambiar y quitar la imagen y la galería", async () => {
    const { id, slug } = await createEvent(h.db, editor, base({ name: "Editable", imageId: m[0], galleryIds: [m[1]] }));
    const antes = await getEventAdmin(h.db, editor, id);
    expect(antes!.image).toEqual({ id: m[0], url: "/media/eventos/img-1.jpg" });
    expect(antes!.gallery).toHaveLength(1);
    await updateEvent(h.db, editor, id, base({ name: "Editable", imageId: m[2], galleryIds: [m[0], m[1]] }));
    const mid = await getEventAdmin(h.db, editor, id);
    expect(mid!.image!.id).toBe(m[2]);
    expect(mid!.gallery.map((g) => g.id)).toEqual([m[0], m[1]]);
    await updateEvent(h.db, editor, id, base({ name: "Editable" }));
    const despues = await getEventAdmin(h.db, editor, id);
    expect(despues!.image).toBeNull();
    expect(despues!.gallery).toEqual([]);
    expect((await getEventPage(h.db, slug))!.imageUrl).toBeNull();
  });

  it("rechaza más de 12 imágenes de galería o ids que no son uuid", async () => {
    await expect(createEvent(h.db, editor, base({ name: "Mucho", galleryIds: Array(13).fill(m[0]) }))).rejects.toThrow();
    await expect(createEvent(h.db, editor, base({ name: "Raro", imageId: "no-uuid" }))).rejects.toThrow();
  });

  it("el mapa del sitio lista solo eventos publicados y no borrados", async () => {
    const slugs = (await listEventSlugs(h.db)).map((s) => s.slug);
    expect(slugs).toContain("festival-uno");
    expect(slugs).not.toContain("borrador");
    expect(slugs).not.toContain("borrado");
  });
});
