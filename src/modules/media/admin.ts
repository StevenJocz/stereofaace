import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { articles, pages } from "@/modules/content/schema";
import { artists } from "@/modules/artists/schema";
import { releases } from "@/modules/releases/schema";
import { recordAudit } from "@/modules/users/audit";
import { media } from "./schema";
import { MEDIA_ROOT, asPublic, type StoredMedia } from "./service";
import { removeStoredMedia } from "./storage";

export const MEDIA_PAGE_SIZE = 24;

export type MediaItem = StoredMedia & { createdAt: Date; usedBy: number };

const metaSchema = z.object({
  alt: z.string().trim().min(1).max(200),
  credit: z.string().trim().min(1).max(200),
  license: z.string().trim().min(1).max(200),
});

/** Escapa `%`, `_` y `\` para que la búsqueda los trate como texto. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Cuántos lugares usan este medio: foto de artista, portada de lanzamiento/artículo o imagen dentro del cuerpo de un artículo o una página. */
async function countUsages(db: Db, id: string, storageKey: string): Promise<number> {
  const ref = `%/media/${likeEscape(storageKey)}%`;
  const one = async (q: Promise<{ c: number }[]>) => Number((await q)[0]?.c ?? 0);
  const counts = await Promise.all([
    one(db.select({ c: sql<number>`count(*)` }).from(artists).where(eq(artists.photoId, id))),
    one(db.select({ c: sql<number>`count(*)` }).from(releases).where(eq(releases.coverId, id))),
    one(
      db
        .select({ c: sql<number>`count(*)` })
        .from(articles)
        .where(or(eq(articles.coverId, id), ilike(articles.coverUrl, ref), ilike(articles.bodyHtml, ref))),
    ),
    one(db.select({ c: sql<number>`count(*)` }).from(pages).where(ilike(pages.bodyHtml, ref))),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

export async function listMediaAdmin(
  db: Db,
  actor: Actor | null,
  q: { search?: string; page?: number } = {},
): Promise<{ items: MediaItem[]; total: number; pageSize: number }> {
  assertCan(actor, "media:read");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const term = q.search?.trim();
  const where = term
    ? or(
        ilike(media.alt, `%${likeEscape(term)}%`),
        ilike(media.credit, `%${likeEscape(term)}%`),
        ilike(media.license, `%${likeEscape(term)}%`),
      )
    : undefined;
  const [rows, [{ c }]] = await Promise.all([
    db
      .select()
      .from(media)
      .where(where)
      .orderBy(desc(media.createdAt))
      .limit(MEDIA_PAGE_SIZE)
      .offset((page - 1) * MEDIA_PAGE_SIZE),
    db.select({ c: sql<number>`count(*)` }).from(media).where(where),
  ]);
  const items = await Promise.all(
    rows.map(async (r) => ({ ...asPublic(r), createdAt: r.createdAt, usedBy: await countUsages(db, r.id, r.storageKey) })),
  );
  return { items, total: Number(c), pageSize: MEDIA_PAGE_SIZE };
}

export async function updateMediaMeta(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
  assertCan(actor, "media:update");
  const input = metaSchema.parse(raw);
  const updated = await db.update(media).set(input).where(eq(media.id, id)).returning({ id: media.id });
  if (updated.length === 0) throw new DomainError("not_found", "Imagen no encontrada");
  await recordAudit(db, { userId: actor.id, action: "media.update", entity: "media", entityId: id });
}

/** Borra el archivo y su registro solo si nada lo usa. */
export async function deleteMedia(db: Db, actor: Actor | null, id: string, opts: { root?: string } = {}): Promise<void> {
  assertCan(actor, "media:delete");
  const [row] = await db
    .select({ id: media.id, storageKey: media.storageKey })
    .from(media)
    .where(and(eq(media.id, id)))
    .limit(1);
  if (!row) throw new DomainError("not_found", "Imagen no encontrada");
  const used = await countUsages(db, row.id, row.storageKey);
  if (used > 0) throw new DomainError("in_use", `No se puede borrar: está en uso en ${used} ${used === 1 ? "lugar" : "lugares"}.`);
  await db.delete(media).where(eq(media.id, id));
  await removeStoredMedia(opts.root ?? MEDIA_ROOT, row.storageKey).catch(() => undefined);
  await recordAudit(db, { userId: actor.id, action: "media.delete", entity: "media", entityId: id });
}
