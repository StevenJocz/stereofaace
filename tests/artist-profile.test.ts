import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";
import {
  articleEntities,
  articles,
  artistGenres,
  artists,
  eventArtists,
  events,
  genres,
  media,
  releaseArtists,
  releases,
  users,
} from "@/db/schema";
import { createArticle, getArticleAdmin, updateArticle } from "@/modules/content/admin";
import { getArtistProfile, getArticleArtists, listArtistSlugs } from "@/modules/artists/profile";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
const NOW = new Date("2026-11-12T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 24 * 3600 * 1000);
let a1: string;
let a2: string;

async function tag(articleId: string, artistId: string) {
  await h.db.insert(articleEntities).values({ articleId, kind: "artist", entityId: artistId });
}
async function art(slug: string, over: Partial<typeof articles.$inferInsert> = {}) {
  const [a] = await h.db
    .insert(articles)
    .values({ slug, title: `Nota ${slug}`, status: "published", publishedAt: day(-1), ...over })
    .returning();
  return a.id;
}

beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "ed@example.com", name: "Ed", role: "editor" }).returning();
  editor = { id: u.id, role: u.role };
  const [photo] = await h.db
    .insert(media)
    .values({ storageKey: "8e565f9c-5944-4eb0-8bd1-e5bc8aebebd0", mime: "image/jpeg", bytes: 1, alt: "Foto", credit: "Autor", license: "CC BY" })
    .returning();
  const [g] = await h.db.insert(genres).values({ slug: "techno", name: "Techno", family: "electronica" }).returning();
  const rows = await h.db
    .insert(artists)
    .values([
      { slug: "nina", name: "Nina", country: "CO", bio: "Bio de Nina.", links: { web: "https://nina.example.org" }, photoId: photo.id },
      { slug: "otro", name: "Otro", country: "AR" },
    ])
    .returning();
  [a1, a2] = rows.map((r) => r.id);
  await h.db.insert(artistGenres).values({ artistId: a1, genreId: g.id });

  const rel = await h.db
    .insert(releases)
    .values([
      { slug: "r-viejo", title: "Viejo", kind: "album", releasedAt: day(-90), status: "published" },
      { slug: "r-nuevo", title: "Nuevo", kind: "ep", releasedAt: day(-5), status: "published" },
      { slug: "r-borrador", title: "Borrador", kind: "single", releasedAt: day(-1), status: "draft" },
    ])
    .returning();
  await h.db.insert(releaseArtists).values(rel.map((r) => ({ releaseId: r.id, artistId: a1 })));

  const ev = await h.db
    .insert(events)
    .values([
      { slug: "e-lejano", name: "Lejano", kind: "festival", startsAt: day(60), city: "Bogotá", country: "CO", status: "published" },
      { slug: "e-cercano", name: "Cercano", kind: "concierto", startsAt: day(10), city: "Cali", country: "CO", status: "published" },
      { slug: "e-pasado", name: "Pasado", kind: "concierto", startsAt: day(-10), city: "Cali", country: "CO", status: "published" },
      { slug: "e-borrador", name: "Borrador", kind: "concierto", startsAt: day(5), city: "Cali", country: "CO", status: "draft" },
    ])
    .returning();
  await h.db.insert(eventArtists).values(ev.map((e) => ({ eventId: e.id, artistId: a1 })));

  await tag(await art("n-viejo", { publishedAt: day(-20) }), a1);
  await tag(await art("n-nuevo", { publishedAt: day(-1) }), a1);
  await tag(await art("n-borrador", { status: "draft", publishedAt: null }), a1);
  await tag(await art("n-futuro", { publishedAt: day(3) }), a1);
  await tag(await art("n-otro-artista"), a2);
  await art("n-sin-etiqueta");
});
afterAll(async () => {
  await h.close();
});

describe("perfil público de artista", () => {
  it("devuelve todos los datos del artista", async () => {
    const p = await getArtistProfile(h.db, "nina", NOW);
    expect(p).toMatchObject({ slug: "nina", name: "Nina", country: "CO", bio: "Bio de Nina." });
    expect(p?.genres).toEqual(["Techno"]);
    expect(p?.links.web).toBe("https://nina.example.org");
    expect(p?.imageUrl).toBe("/media/8e565f9c-5944-4eb0-8bd1-e5bc8aebebd0");
    expect(p?.photoCredit).toMatchObject({ credit: "Autor", license: "CC BY", alt: "Foto" });
  });

  it("muestra solo las noticias publicadas donde está etiquetado, de la más reciente a la más antigua", async () => {
    const p = await getArtistProfile(h.db, "nina", NOW);
    expect(p?.news.map((n) => n.slug)).toEqual(["n-nuevo", "n-viejo"]);
  });

  it("lista lanzamientos publicados (nuevos primero) y solo los eventos futuros publicados (el más próximo primero)", async () => {
    const p = await getArtistProfile(h.db, "nina", NOW);
    expect(p?.releases.map((r) => r.slug)).toEqual(["r-nuevo", "r-viejo"]);
    expect(p?.events.map((e) => e.slug)).toEqual(["e-cercano", "e-lejano"]);
  });

  it("un artista sin nada asociado devuelve listas vacías; uno borrado o inexistente, null", async () => {
    const o = await getArtistProfile(h.db, "otro", NOW);
    expect(o?.releases).toEqual([]);
    expect(o?.events).toEqual([]);
    expect(o?.news.map((n) => n.slug)).toEqual(["n-otro-artista"]);
    await h.db.update(artists).set({ deletedAt: NOW }).where(eq(artists.slug, "otro"));
    expect(await getArtistProfile(h.db, "otro", NOW)).toBeNull();
    expect(await getArtistProfile(h.db, "no-existe", NOW)).toBeNull();
    await h.db.update(artists).set({ deletedAt: null }).where(eq(artists.slug, "otro"));
  });

  it("listArtistSlugs omite los borrados y getArticleArtists devuelve los artistas de una nota", async () => {
    expect((await listArtistSlugs(h.db)).map((s) => s.slug).sort()).toEqual(["nina", "otro"]);
    const [n] = await h.db.select().from(articles).where(eq(articles.slug, "n-nuevo"));
    expect((await getArticleArtists(h.db, n.id)).map((x) => x.slug)).toEqual(["nina"]);
  });
});

describe("etiquetar artistas desde el editor", () => {
  it("createArticle guarda los artistas y getArticleAdmin los devuelve", async () => {
    const { id } = await createArticle(h.db, editor, { title: "Nota con artistas", status: "draft", artistIds: [a1, a2] });
    expect((await getArticleAdmin(h.db, editor, id))?.artistIds.sort()).toEqual([a1, a2].sort());
  });

  it("updateArticle reemplaza la lista; una lista vacía quita todas las etiquetas", async () => {
    const { id } = await createArticle(h.db, editor, { title: "Otra nota", status: "draft", artistIds: [a1] });
    await updateArticle(h.db, editor, id, { title: "Otra nota", status: "draft", artistIds: [a2] });
    expect((await getArticleAdmin(h.db, editor, id))?.artistIds).toEqual([a2]);
    await updateArticle(h.db, editor, id, { title: "Otra nota", status: "draft", artistIds: [] });
    expect((await getArticleAdmin(h.db, editor, id))?.artistIds).toEqual([]);
    expect(await h.db.select().from(articleEntities).where(and(eq(articleEntities.articleId, id), eq(articleEntities.kind, "artist")))).toHaveLength(0);
  });

  it("rechaza un artista que no existe o está borrado", async () => {
    await expect(
      createArticle(h.db, editor, { title: "Nota con fantasma", status: "draft", artistIds: ["00000000-0000-4000-8000-000000000000"] }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
