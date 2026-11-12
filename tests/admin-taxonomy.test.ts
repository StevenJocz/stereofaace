import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { articleTags, articles, artists, artistGenres, categories, events, tags, users } from "@/db/schema";
import { deleteTaxonomy, listTaxonomy, saveTaxonomy } from "@/modules/taxonomy/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}

beforeAll(async () => {
  h = await makeDb();
  editor = await mkUser("editor", "ed");
  redactor = await mkUser("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("taxonomía (administración)", () => {
  it("slugs repetidos reciben sufijo y la edición conserva el propio", async () => {
    const a = await saveTaxonomy(h.db, editor, "category", { name: "Escena" });
    const b = await saveTaxonomy(h.db, editor, "category", { name: "Escena" });
    expect(b.id).not.toBe(a.id);
    const rows = await listTaxonomy(h.db, editor, "category");
    expect(rows.map((r) => r.slug).sort()).toEqual(["escena", "escena-2"]);
    await saveTaxonomy(h.db, editor, "category", { id: a.id, name: "Escena local", slug: "escena" });
    expect((await listTaxonomy(h.db, editor, "category")).find((r) => r.id === a.id)?.slug).toBe("escena");
  });

  it("valida color y familia", async () => {
    await expect(saveTaxonomy(h.db, editor, "category", { name: "Mal color", color: "verde" })).rejects.toBeInstanceOf(ZodError);
    await expect(saveTaxonomy(h.db, editor, "genre", { name: "Mala familia", family: "pop" })).rejects.toBeInstanceOf(ZodError);
    const ok = await saveTaxonomy(h.db, editor, "category", { name: "Con color", color: "#c6ff00", position: 3 });
    expect((await listTaxonomy(h.db, editor, "category")).find((r) => r.id === ok.id)).toMatchObject({ color: "#c6ff00", position: 3 });
  });

  it("no borra una categoría en uso y dice cuántos elementos la usan", async () => {
    const { id } = await saveTaxonomy(h.db, editor, "category", { name: "Usada" });
    await h.db.insert(articles).values({ slug: "x1", title: "X1", categoryId: id });
    await h.db.insert(articles).values({ slug: "x2", title: "X2", categoryId: id });
    await expect(deleteTaxonomy(h.db, editor, "category", id)).rejects.toMatchObject({
      name: "DomainError",
      code: "in_use",
      message: expect.stringContaining("2"),
    });
    expect((await listTaxonomy(h.db, editor, "category")).find((r) => r.id === id)?.usage).toBe(2);
  });

  it("no borra un género usado por un artista ni por un evento", async () => {
    const byArtist = await saveTaxonomy(h.db, editor, "genre", { name: "De artista", family: "indie" });
    const [artist] = await h.db.insert(artists).values({ slug: "art", name: "Art" }).returning();
    await h.db.insert(artistGenres).values({ artistId: artist.id, genreId: byArtist.id });
    await expect(deleteTaxonomy(h.db, editor, "genre", byArtist.id)).rejects.toMatchObject({ code: "in_use" });

    const byEvent = await saveTaxonomy(h.db, editor, "genre", { name: "De evento" });
    await h.db.insert(events).values({ slug: "ev", name: "Ev", kind: "rave", startsAt: new Date(), city: "Cali", country: "CO", genreId: byEvent.id });
    await expect(deleteTaxonomy(h.db, editor, "genre", byEvent.id)).rejects.toMatchObject({ code: "in_use" });
  });

  it("borra una etiqueta libre y rechaza una en uso", async () => {
    const free = await saveTaxonomy(h.db, editor, "tag", { name: "libre" });
    await deleteTaxonomy(h.db, editor, "tag", free.id);
    expect((await listTaxonomy(h.db, editor, "tag")).map((t) => t.id)).not.toContain(free.id);

    const used = await saveTaxonomy(h.db, editor, "tag", { name: "usada" });
    const [art] = await h.db.insert(articles).values({ slug: "con-tag", title: "Con tag" }).returning();
    await h.db.insert(articleTags).values({ articleId: art.id, tagId: used.id });
    await expect(deleteTaxonomy(h.db, editor, "tag", used.id)).rejects.toMatchObject({ code: "in_use" });
    expect(await h.db.select().from(tags)).toHaveLength(1);
  });

  it("un redactor crea etiquetas pero no categorías ni borra nada", async () => {
    const t = await saveTaxonomy(h.db, redactor, "tag", { name: "de redactor" });
    await expect(saveTaxonomy(h.db, redactor, "category", { name: "No" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteTaxonomy(h.db, redactor, "tag", t.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await h.db.select().from(categories)).length).toBeGreaterThan(0);
  });
});
