import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { articles, homeBlocks, users } from "@/db/schema";
import { getHomeData } from "@/modules/content/service";
import {
  listHomeBlocksAdmin,
  moveHomeBlock,
  removeHomeBlock,
  saveHomeBlock,
  setHomeBlockActive,
} from "@/modules/content/home-blocks";
import { heroConfigSchema } from "@/modules/content/home-blocks-validators";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
let pub: string[] = [];
let draft: string;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
async function mkArticle(slug: string, status: "published" | "draft") {
  const [a] = await h.db
    .insert(articles)
    .values({ slug, title: `Título ${slug}`, status, publishedAt: status === "published" ? new Date("2020-01-01") : null })
    .returning();
  return a.id;
}
const positions = async (kind: "hero" | "feature") =>
  (await h.db.select().from(homeBlocks).where(eq(homeBlocks.kind, kind))).map((b) => b.position).sort();

beforeAll(async () => {
  h = await makeDb();
  editor = await mkUser("editor", "ed");
  redactor = await mkUser("redactor", "red");
  pub = [await mkArticle("a", "published"), await mkArticle("b", "published"), await mkArticle("c", "published")];
  draft = await mkArticle("borrador", "draft");
});
afterAll(async () => {
  await h.close();
});

describe("bloques de portada", () => {
  it("añade slides al final y rechaza artículos no publicados", async () => {
    const a = await saveHomeBlock(h.db, editor, { kind: "hero", articleId: pub[0] });
    const b = await saveHomeBlock(h.db, editor, { kind: "hero", articleId: pub[1] });
    const c = await saveHomeBlock(h.db, editor, { kind: "hero", articleId: pub[2] });
    expect(await positions("hero")).toEqual([0, 1, 2]);
    expect(a.id).not.toBe(b.id);
    expect(c.id).toBeTruthy();
    await expect(saveHomeBlock(h.db, editor, { kind: "hero", articleId: draft })).rejects.toBeInstanceOf(DomainError);
  });

  it("moveHomeBlock intercambia posiciones sin violar el índice único y no hace nada en los extremos", async () => {
    const [first, second] = (await listHomeBlocksAdmin(h.db, editor)).filter((b) => b.kind === "hero");
    await moveHomeBlock(h.db, editor, first.id, "down");
    const after = (await listHomeBlocksAdmin(h.db, editor)).filter((b) => b.kind === "hero");
    expect(after.map((b) => b.id).slice(0, 2)).toEqual([second.id, first.id]);
    await moveHomeBlock(h.db, editor, second.id, "up"); // ya es el primero
    expect((await listHomeBlocksAdmin(h.db, editor)).filter((b) => b.kind === "hero")[0].id).toBe(second.id);
  });

  it("setHomeBlockActive y la edición actualizan el bloque", async () => {
    const [blk] = (await listHomeBlocksAdmin(h.db, editor)).filter((b) => b.kind === "hero");
    await setHomeBlockActive(h.db, editor, blk.id, false);
    await saveHomeBlock(h.db, editor, { id: blk.id, kind: "hero", articleId: blk.article.id, config: { phrase: "Hola", accentFrom: 1 } });
    const [row] = await h.db.select().from(homeBlocks).where(eq(homeBlocks.id, blk.id));
    expect(row.active).toBe(false);
    expect(row.config).toMatchObject({ phrase: "Hola", accentFrom: 1 });
    await setHomeBlockActive(h.db, editor, blk.id, true);
  });

  it("marca el problema cuando el artículo se despublica o se borra, y la portada no se rompe", async () => {
    const blocks = (await listHomeBlocksAdmin(h.db, editor)).filter((b) => b.kind === "hero");
    const target = blocks[0];
    await h.db.update(articles).set({ status: "draft" }).where(eq(articles.id, target.article.id));
    let list = await listHomeBlocksAdmin(h.db, editor);
    expect(list.find((b) => b.id === target.id)?.problem).toBe("unpublished");
    const home = await getHomeData(h.db);
    expect(home.hero.map((s) => s.id)).not.toContain(target.article.id);

    await h.db.update(articles).set({ status: "published", deletedAt: new Date() }).where(eq(articles.id, target.article.id));
    list = await listHomeBlocksAdmin(h.db, editor);
    expect(list.find((b) => b.id === target.id)?.problem).toBe("deleted");
    await h.db.update(articles).set({ deletedAt: null }).where(eq(articles.id, target.article.id));
  });

  it("removeHomeBlock recompacta las posiciones", async () => {
    const [blk] = (await listHomeBlocksAdmin(h.db, editor)).filter((b) => b.kind === "hero");
    await removeHomeBlock(h.db, editor, blk.id);
    expect(await positions("hero")).toEqual([0, 1]);
  });

  it("un redactor no puede gestionar la portada", async () => {
    await expect(saveHomeBlock(h.db, redactor, { kind: "feature", articleId: pub[0] })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listHomeBlocksAdmin(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("heroConfigSchema acota los textos", () => {
    expect(heroConfigSchema.safeParse({ phrase: "x".repeat(161) }).success).toBe(false);
    expect(heroConfigSchema.safeParse({ path: ["a", "b"] }).success).toBe(false);
    expect(heroConfigSchema.safeParse({ path: ["Música", "Cultura", "Escena"], figure: true }).success).toBe(true);
  });
});
