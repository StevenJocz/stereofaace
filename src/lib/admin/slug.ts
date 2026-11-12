import { inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/lib/db";

/** Cualquier tabla con columnas `id` y `slug`. */
export type SluggableTable = PgTable & { id: PgColumn; slug: PgColumn };

/**
 * Devuelve `base` si está libre; si no, `base-2` … `base-21`, y como último recurso `base-<tiempo>`.
 * `exceptId` permite conservar el slug propio al editar. Con `base` vacío usa `fallback`.
 */
export async function uniqueSlug(
  db: Db,
  table: SluggableTable,
  base: string,
  fallback: string,
  exceptId?: string,
): Promise<string> {
  const root = base || fallback;
  const candidates = [root, ...Array.from({ length: 20 }, (_, i) => `${root}-${i + 2}`)];
  const taken = (await db
    .select({ id: table.id, slug: table.slug })
    .from(table as PgTable)
    .where(inArray(table.slug, candidates))) as { id: string; slug: string }[];
  const used = new Set(taken.filter((t) => t.id !== exceptId).map((t) => t.slug));
  return candidates.find((c) => !used.has(c)) ?? `${root}-${Date.now().toString(36)}`;
}
