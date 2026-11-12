import { asc, eq, isNotNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor, type Permission } from "@/lib/rbac";
import { uniqueSlug } from "@/lib/admin/slug";
import { slugify } from "@/lib/slug";
import { articleTags, articles } from "@/modules/content/schema";
import { artistGenres } from "@/modules/artists/schema";
import { events } from "@/modules/events/schema";
import { sources } from "@/modules/ingest/schema";
import { radioStationGenres } from "@/modules/radio/schema";
import { recordAudit } from "@/modules/users/audit";
import { categories, genres, tags } from "./schema";
import { taxonomyInputSchema } from "./validators";

export type TaxonomyKind = "category" | "tag" | "genre";
export type TaxonomyRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  color: string | null;
  position: number | null;
  family: string | null;
  /** Cuántos elementos (artículos, artistas, eventos…) la usan. */
  usage: number;
};

/** Los géneros se gestionan con el permiso de categorías. */
const resource = (kind: TaxonomyKind): "tag" | "category" => (kind === "tag" ? "tag" : "category");
const perm = (kind: TaxonomyKind, action: "read" | "create" | "update" | "delete") =>
  `${resource(kind)}:${action}` as Permission;
const LABEL: Record<TaxonomyKind, string> = { category: "categoría", tag: "etiqueta", genre: "género" };

/** Cuenta filas agrupadas por una columna de referencia. */
async function countBy(db: Db, col: PgColumn, from: Parameters<ReturnType<Db["select"]>["from"]>[0]): Promise<Map<string, number>> {
  const rows = (await db
    .select({ id: col, c: sql<number>`count(*)` })
    .from(from)
    .where(isNotNull(col) as SQL)
    .groupBy(col)) as { id: string; c: number }[];
  return new Map(rows.map((r) => [r.id, Number(r.c)]));
}

async function usageMap(db: Db, kind: TaxonomyKind): Promise<Map<string, number>> {
  const parts =
    kind === "category"
      ? [await countBy(db, articles.categoryId, articles), await countBy(db, sources.defaultCategoryId, sources)]
      : kind === "tag"
        ? [await countBy(db, articleTags.tagId, articleTags)]
        : [
            await countBy(db, artistGenres.genreId, artistGenres),
            await countBy(db, events.genreId, events),
            await countBy(db, radioStationGenres.genreId, radioStationGenres),
          ];
  const total = new Map<string, number>();
  for (const m of parts) for (const [id, n] of m) total.set(id, (total.get(id) ?? 0) + n);
  return total;
}

export async function listTaxonomy(db: Db, actor: Actor | null, kind: TaxonomyKind): Promise<TaxonomyRow[]> {
  assertCan(actor, perm(kind, "read"));
  const usage = await usageMap(db, kind);
  if (kind === "category") {
    const rows = await db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
    return rows.map((r) => ({ ...r, family: null, usage: usage.get(r.id) ?? 0 }));
  }
  if (kind === "tag") {
    const rows = await db.select().from(tags).orderBy(asc(tags.name));
    return rows.map((r) => ({ ...r, description: null, color: null, position: null, family: null, usage: usage.get(r.id) ?? 0 }));
  }
  const rows = await db.select().from(genres).orderBy(asc(genres.name));
  return rows.map((r) => ({ ...r, description: null, color: null, position: null, usage: usage.get(r.id) ?? 0 }));
}

/** Crea o actualiza (si trae `id`) una categoría, etiqueta o género. */
export async function saveTaxonomy(db: Db, actor: Actor | null, kind: TaxonomyKind, raw: unknown): Promise<{ id: string }> {
  const input = taxonomyInputSchema.parse(raw);
  assertCan(actor, perm(kind, input.id ? "update" : "create"));
  const table = kind === "category" ? categories : kind === "tag" ? tags : genres;
  const base = slugify(input.name);

  const values =
    kind === "category"
      ? { name: input.name, description: input.description ?? null, color: input.color ?? null }
      : kind === "genre"
        ? { name: input.name, family: input.family ?? "otros" }
        : { name: input.name };

  if (input.id) {
    const [current] = await db.select({ id: table.id, slug: table.slug }).from(table).where(eq(table.id, input.id)).limit(1);
    if (!current) throw new DomainError("not_found", `No se encontró la ${LABEL[kind]}`);
    const slug = input.slug ? await uniqueSlug(db, table, input.slug, kind, input.id) : current.slug;
    await db
      .update(table)
      .set({ ...values, slug, ...(kind === "category" && input.position !== undefined ? { position: input.position } : {}) })
      .where(eq(table.id, input.id));
    await recordAudit(db, { userId: actor.id, action: `${kind}.update`, entity: kind, entityId: input.id });
    return { id: input.id };
  }

  const slug = await uniqueSlug(db, table, input.slug ?? base, kind);
  let position = input.position;
  if (kind === "category" && position === undefined) {
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${categories.position}), -1) + 1` }).from(categories);
    position = Number(next);
  }
  const [row] = await db
    .insert(table)
    .values({ ...values, slug, ...(kind === "category" ? { position } : {}) } as never)
    .returning({ id: table.id });
  await recordAudit(db, { userId: actor.id, action: `${kind}.create`, entity: kind, entityId: row.id });
  return row;
}

/** Borra solo si nada la usa; si está en uso, dice cuántos elementos dependen de ella. */
export async function deleteTaxonomy(db: Db, actor: Actor | null, kind: TaxonomyKind, id: string): Promise<void> {
  assertCan(actor, perm(kind, "delete"));
  const table = kind === "category" ? categories : kind === "tag" ? tags : genres;
  const used = (await usageMap(db, kind)).get(id) ?? 0;
  if (used > 0)
    throw new DomainError(
      "in_use",
      `Está en uso en ${used} ${used === 1 ? "elemento" : "elementos"}. Quítala o reasígnala primero.`,
    );
  const done = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  if (done.length === 0) throw new DomainError("not_found", `No se encontró la ${LABEL[kind]}`);
  await recordAudit(db, { userId: actor.id, action: `${kind}.delete`, entity: kind, entityId: id });
}

