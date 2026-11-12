import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { genres, media, users } from "@/db/schema";
import { listFeaturedArtists } from "@/modules/artists/service";
import {
  createArtist,
  deleteArtist,
  getArtistAdmin,
  listArtistOptions,
  listArtistsAdmin,
  restoreArtist,
  updateArtist,
} from "@/modules/artists/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let colaborador: Actor;
let genreIds: string[];

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}

beforeAll(async () => {
  h = await makeDb();
  editor = await mkUser("editor", "ed");
  colaborador = await mkUser("colaborador", "colab");
  const rows = await h.db
    .insert(genres)
    .values([
      { slug: "techno", name: "Techno", family: "electronica" },
      { slug: "house", name: "House", family: "electronica" },
    ])
    .returning();
  genreIds = rows.map((r) => r.id);
});
afterAll(async () => {
  await h.close();
});

describe("artistas (administración)", () => {
  it("crea con géneros y enlaces y los devuelve al leer", async () => {
    const { id } = await createArtist(h.db, editor, {
      name: "Nina Frecuencia",
      country: "CO",
      genreIds,
      links: { spotify: "https://open.spotify.com/artist/abc" },
      featured: true,
    });
    const a = await getArtistAdmin(h.db, editor, id);
    expect(a).toMatchObject({ name: "Nina Frecuencia", country: "CO", featured: true });
    expect([...(a?.genreIds ?? [])].sort()).toEqual([...genreIds].sort());
    expect(a?.links.spotify).toBe("https://open.spotify.com/artist/abc");
  });

  it("repetir el nombre genera slug con sufijo en vez de fallar", async () => {
    const a = await createArtist(h.db, editor, { name: "Repetido" });
    const b = await createArtist(h.db, editor, { name: "Repetido" });
    expect([a.slug, b.slug]).toEqual(["repetido", "repetido-2"]);
  });

  it("rechaza enlaces que no son https", async () => {
    await expect(
      createArtist(h.db, editor, { name: "Mal enlace", links: { web: "http://example.org" } }),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("updateArtist cambia datos y reemplaza géneros", async () => {
    const { id } = await createArtist(h.db, editor, { name: "Editable", genreIds: [genreIds[0]] });
    await updateArtist(h.db, editor, id, { name: "Editable 2", genreIds: [genreIds[1]], featured: false });
    const a = await getArtistAdmin(h.db, editor, id);
    expect(a).toMatchObject({ name: "Editable 2" });
    expect(a?.genreIds).toEqual([genreIds[1]]);
  });

  it("el borrado es lógico: sale de la portada y del listado, y se puede restaurar", async () => {
    const { id } = await createArtist(h.db, editor, { name: "Para borrar", featured: true });
    expect((await listFeaturedArtists(h.db, 20)).map((x) => x.id)).toContain(id);
    await deleteArtist(h.db, editor, id);
    expect((await listFeaturedArtists(h.db, 20)).map((x) => x.id)).not.toContain(id);
    expect((await listArtistsAdmin(h.db, editor, {})).items.map((x) => x.id)).not.toContain(id);
    expect((await listArtistsAdmin(h.db, editor, { includeDeleted: true })).items.map((x) => x.id)).toContain(id);
    await restoreArtist(h.db, editor, id);
    expect((await listFeaturedArtists(h.db, 20)).map((x) => x.id)).toContain(id);
  });

  it("la foto subida llega a la portada como imageUrl", async () => {
    const key = "8e565f9c-5944-4eb0-8bd1-e5bc8aebebd0";
    const [m] = await h.db.insert(media).values({ storageKey: key, mime: "image/png", bytes: 10, alt: "x" }).returning();
    const { id } = await createArtist(h.db, editor, { name: "Con foto", featured: true, photoId: m.id });
    const card = (await listFeaturedArtists(h.db, 20)).find((x) => x.id === id);
    expect(card?.imageUrl).toBe(`/media/${key}`);
  });

  it("la búsqueda filtra por nombre", async () => {
    const r = await listArtistsAdmin(h.db, editor, { search: "nina" });
    expect(r.items.map((x) => x.name)).toEqual(["Nina Frecuencia"]);
  });

  it("un colaborador puede leer pero no crear", async () => {
    await expect(createArtist(h.db, colaborador, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listArtistsAdmin(h.db, colaborador, {})).total).toBeGreaterThan(0);
    await expect(updateArtist(h.db, editor, "00000000-0000-4000-8000-000000000000", { name: "Nadie" })).rejects.toBeInstanceOf(DomainError);
  });

  it("listArtistOptions devuelve solo artistas visibles, ordenados por nombre", async () => {
    const { id } = await createArtist(h.db, editor, { name: "Aaa oculto" });
    await deleteArtist(h.db, editor, id);
    const opts = await listArtistOptions(h.db, editor);
    expect(opts.map((o) => o.id)).not.toContain(id);
    expect(opts.map((o) => o.name)).toEqual([...opts.map((o) => o.name)].sort((x, y) => x.localeCompare(y, "es")));
  });
});
