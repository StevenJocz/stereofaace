import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { splitHeroTitle } from "@/ui/hero-copy";
import { recordAudit } from "@/modules/users/audit";
import { articles, homeBlocks, type ArticleState, type HeroConfig, type HomeBlockKind } from "./schema";
import { homeBlockInputSchema } from "./home-blocks-validators";

/** Gestionar la portada exige poder publicar artículos (editor o superior). */
const PERMISSION = "article:publish" as const;

export type HomeBlockRow = {
  id: string;
  kind: HomeBlockKind;
  position: number;
  active: boolean;
  config: HeroConfig | Record<string, never>;
  article: { id: string; title: string; status: ArticleState; deleted: boolean };
  /** Por qué este bloque no se está mostrando en la portada, si es el caso. */
  problem: "unpublished" | "deleted" | null;
};

export async function listHomeBlocksAdmin(db: Db, actor: Actor | null): Promise<HomeBlockRow[]> {
  assertCan(actor, PERMISSION);
  const rows = await db
    .select({
      id: homeBlocks.id,
      kind: homeBlocks.kind,
      position: homeBlocks.position,
      active: homeBlocks.active,
      config: homeBlocks.config,
      articleId: articles.id,
      title: articles.title,
      status: articles.status,
      deletedAt: articles.deletedAt,
    })
    .from(homeBlocks)
    .innerJoin(articles, eq(articles.id, homeBlocks.articleId))
    .orderBy(asc(homeBlocks.kind), asc(homeBlocks.position));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    position: r.position,
    active: r.active,
    config: r.config,
    article: { id: r.articleId, title: r.title, status: r.status, deleted: r.deletedAt !== null },
    problem: r.deletedAt ? "deleted" : r.status === "published" || r.status === "scheduled" ? null : "unpublished",
  }));
}

/** Crea un bloque al final de su tipo, o actualiza uno existente (el tipo no cambia). */
export async function saveHomeBlock(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string }> {
  assertCan(actor, PERMISSION);
  const input = homeBlockInputSchema.parse(raw);
  const [article] = await db
    .select({ id: articles.id, title: articles.title, status: articles.status, deletedAt: articles.deletedAt })
    .from(articles)
    .where(eq(articles.id, input.articleId))
    .limit(1);
  if (!article || article.deletedAt || article.status !== "published")
    throw new DomainError("bad_article", "Elige un artículo publicado.");

  // En el hero, las líneas del titular salen siempre del título actual del artículo.
  const config = (input.kind === "hero" ? { ...input.config, lines: splitHeroTitle(article.title) } : {}) as HeroConfig;

  if (input.id) {
    const [current] = await db.select().from(homeBlocks).where(eq(homeBlocks.id, input.id)).limit(1);
    if (!current) throw new DomainError("not_found", "Bloque no encontrado");
    await db
      .update(homeBlocks)
      .set({ articleId: input.articleId, config, ...(input.active === undefined ? {} : { active: input.active }) })
      .where(eq(homeBlocks.id, input.id));
    await recordAudit(db, { userId: actor.id, action: "home_block.update", entity: "home_block", entityId: input.id });
    return { id: input.id };
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${homeBlocks.position}), -1) + 1` })
    .from(homeBlocks)
    .where(eq(homeBlocks.kind, input.kind));
  const [row] = await db
    .insert(homeBlocks)
    .values({ kind: input.kind, position: Number(next), articleId: input.articleId, config, active: input.active ?? true })
    .returning({ id: homeBlocks.id });
  await recordAudit(db, { userId: actor.id, action: "home_block.create", entity: "home_block", entityId: row.id });
  return row;
}

export async function setHomeBlockActive(db: Db, actor: Actor | null, id: string, active: boolean): Promise<void> {
  assertCan(actor, PERMISSION);
  const done = await db.update(homeBlocks).set({ active }).where(eq(homeBlocks.id, id)).returning({ id: homeBlocks.id });
  if (done.length === 0) throw new DomainError("not_found", "Bloque no encontrado");
  await recordAudit(db, { userId: actor.id, action: "home_block.update", entity: "home_block", entityId: id, diff: { active } });
}

/** Intercambia la posición con la del vecino. En los extremos no hace nada. */
export async function moveHomeBlock(db: Db, actor: Actor | null, id: string, direction: "up" | "down"): Promise<void> {
  assertCan(actor, PERMISSION);
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(homeBlocks).where(eq(homeBlocks.id, id)).limit(1);
    if (!cur) throw new DomainError("not_found", "Bloque no encontrado");
    const neighbours = await tx
      .select()
      .from(homeBlocks)
      .where(eq(homeBlocks.kind, cur.kind))
      .orderBy(asc(homeBlocks.position));
    const i = neighbours.findIndex((b) => b.id === id);
    const other = neighbours[direction === "up" ? i - 1 : i + 1];
    if (!other) return;
    // El índice único (kind, position) obliga a pasar por una posición libre.
    await tx.update(homeBlocks).set({ position: -1 }).where(eq(homeBlocks.id, cur.id));
    await tx.update(homeBlocks).set({ position: cur.position }).where(eq(homeBlocks.id, other.id));
    await tx.update(homeBlocks).set({ position: other.position }).where(eq(homeBlocks.id, cur.id));
  });
  await recordAudit(db, { userId: actor.id, action: "home_block.move", entity: "home_block", entityId: id, diff: { direction } });
}

/** Borra el bloque (no el artículo) y deja las posiciones consecutivas desde 0. */
export async function removeHomeBlock(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, PERMISSION);
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(homeBlocks).where(eq(homeBlocks.id, id)).limit(1);
    if (!cur) throw new DomainError("not_found", "Bloque no encontrado");
    await tx.delete(homeBlocks).where(eq(homeBlocks.id, id));
    const after = await tx
      .select()
      .from(homeBlocks)
      .where(and(eq(homeBlocks.kind, cur.kind), gt(homeBlocks.position, cur.position)))
      .orderBy(asc(homeBlocks.position));
    // Orden ascendente: cada bloque ocupa el hueco que dejó el anterior.
    for (const b of after) await tx.update(homeBlocks).set({ position: b.position - 1 }).where(eq(homeBlocks.id, b.id));
  });
  await recordAudit(db, { userId: actor.id, action: "home_block.remove", entity: "home_block", entityId: id });
}
