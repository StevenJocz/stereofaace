import { and, asc, desc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { uniqueSlug } from "@/lib/admin/slug";
import { slugify } from "@/lib/slug";
import { artists } from "@/modules/artists/schema";
import { media } from "@/modules/media/schema";
import { recordAudit } from "@/modules/users/audit";
import { releaseArtists, releases, type ReleaseKind } from "./schema";
import { releaseInputSchema } from "./validators";

export const RELEASE_PAGE_SIZE = 20;
export type ReleaseRow = typeof releases.$inferSelect;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function setCredits(db: Db, releaseId: string, artistIds: string[]) {
  await db.delete(releaseArtists).where(eq(releaseArtists.releaseId, releaseId));
  const unique = [...new Set(artistIds)];
  if (unique.length)
    await db.insert(releaseArtists).values(unique.map((artistId, position) => ({ releaseId, artistId, position })));
}

export async function listReleasesAdmin(
  db: Db,
  actor: Actor | null,
  q: {
    search?: string;
    status?: "draft" | "published";
    kind?: ReleaseKind;
    includeDeleted?: boolean;
    page?: number;
  } = {},
): Promise<{ items: (ReleaseRow & { artistNames: string[] })[]; total: number; pageSize: number }> {
  assertCan(actor, "release:read");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const term = q.search?.trim();
  const where = and(
    q.includeDeleted ? undefined : isNull(releases.deletedAt),
    q.status ? eq(releases.status, q.status) : undefined,
    q.kind ? eq(releases.kind, q.kind) : undefined,
    term ? ilike(releases.title, `%${likeEscape(term)}%`) : undefined,
  );
  const [rows, [{ c }]] = await Promise.all([
    db
      .select()
      .from(releases)
      .where(where)
      .orderBy(desc(releases.releasedAt), asc(releases.title))
      .limit(RELEASE_PAGE_SIZE)
      .offset((page - 1) * RELEASE_PAGE_SIZE),
    db.select({ c: sql<number>`count(*)` }).from(releases).where(where),
  ]);
  const credits = rows.length
    ? await db
        .select({ releaseId: releaseArtists.releaseId, name: artists.name })
        .from(releaseArtists)
        .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
        .where(inArray(releaseArtists.releaseId, rows.map((r) => r.id)))
        .orderBy(asc(releaseArtists.position))
    : [];
  return {
    items: rows.map((r) => ({ ...r, artistNames: credits.filter((c2) => c2.releaseId === r.id).map((c2) => c2.name) })),
    total: Number(c),
    pageSize: RELEASE_PAGE_SIZE,
  };
}

/** Un lanzamiento (también si está borrado) con sus artistas en orden y la URL de su portada. */
export async function getReleaseAdmin(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "release:read");
  const [row] = await db
    .select({ release: releases, coverKey: media.storageKey })
    .from(releases)
    .leftJoin(media, eq(media.id, releases.coverId))
    .where(eq(releases.id, id))
    .limit(1);
  if (!row) return null;
  const credits = await db
    .select({ artistId: releaseArtists.artistId })
    .from(releaseArtists)
    .where(eq(releaseArtists.releaseId, id))
    .orderBy(asc(releaseArtists.position));
  return {
    ...row.release,
    artistIds: credits.map((c) => c.artistId),
    coverUrl: row.coverKey ? `/media/${row.coverKey}` : null,
  };
}

export async function createRelease(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string; slug: string }> {
  assertCan(actor, "release:create");
  const input = releaseInputSchema.parse(raw);
  if (input.status === "published") assertCan(actor, "release:publish");
  const slug = await uniqueSlug(db, releases, input.slug ?? slugify(input.title), "lanzamiento");
  const [row] = await db
    .insert(releases)
    .values({
      slug,
      title: input.title,
      kind: input.kind,
      releasedAt: input.releasedAt,
      label: input.label,
      coverId: input.coverId,
      coverArt: input.coverArt,
      embedUrl: input.embedUrl,
      status: input.status,
    })
    .returning({ id: releases.id, slug: releases.slug });
  await setCredits(db, row.id, input.artistIds);
  await recordAudit(db, { userId: actor.id, action: "release.create", entity: "release", entityId: row.id });
  return row;
}

export async function updateRelease(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
  assertCan(actor, "release:update");
  const input = releaseInputSchema.parse(raw);
  const [current] = await db.select().from(releases).where(and(eq(releases.id, id), isNull(releases.deletedAt))).limit(1);
  if (!current) throw new DomainError("not_found", "Lanzamiento no encontrado");
  if (input.status !== current.status) assertCan(actor, "release:publish");
  await db
    .update(releases)
    .set({
      title: input.title,
      slug: input.slug ? await uniqueSlug(db, releases, input.slug, "lanzamiento", id) : current.slug,
      kind: input.kind,
      releasedAt: input.releasedAt,
      label: input.label ?? null,
      coverId: input.coverId ?? null,
      coverArt: input.coverArt ?? null,
      embedUrl: input.embedUrl ?? null,
      status: input.status,
    })
    .where(eq(releases.id, id));
  await setCredits(db, id, input.artistIds);
  await recordAudit(db, { userId: actor.id, action: "release.update", entity: "release", entityId: id });
}

export async function setReleaseStatus(db: Db, actor: Actor | null, id: string, status: "draft" | "published"): Promise<void> {
  assertCan(actor, "release:publish");
  const done = await db
    .update(releases)
    .set({ status })
    .where(and(eq(releases.id, id), isNull(releases.deletedAt)))
    .returning({ id: releases.id });
  if (done.length === 0) throw new DomainError("not_found", "Lanzamiento no encontrado");
  await recordAudit(db, { userId: actor.id, action: "release.status", entity: "release", entityId: id, diff: { status } });
}

/** Borrado lógico: se oculta pero se puede restaurar. */
export async function deleteRelease(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "release:delete");
  const done = await db
    .update(releases)
    .set({ deletedAt: new Date() })
    .where(and(eq(releases.id, id), isNull(releases.deletedAt)))
    .returning({ id: releases.id });
  if (done.length === 0) throw new DomainError("not_found", "Lanzamiento no encontrado");
  await recordAudit(db, { userId: actor.id, action: "release.delete", entity: "release", entityId: id });
}

export async function restoreRelease(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "release:delete");
  const done = await db.update(releases).set({ deletedAt: null }).where(eq(releases.id, id)).returning({ id: releases.id });
  if (done.length === 0) throw new DomainError("not_found", "Lanzamiento no encontrado");
  await recordAudit(db, { userId: actor.id, action: "release.restore", entity: "release", entityId: id });
}
