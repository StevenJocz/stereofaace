import { and, asc, eq, ilike, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { uniqueSlug } from "@/lib/admin/slug";
import { slugify } from "@/lib/slug";
import { media } from "@/modules/media/schema";
import { genres } from "@/modules/taxonomy/schema";
import { recordAudit } from "@/modules/users/audit";
import { artistGenres, artists } from "./schema";
import { artistInputSchema } from "./validators";

export const ARTIST_PAGE_SIZE = 20;
export type ArtistRow = typeof artists.$inferSelect;

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function setGenres(db: Db, artistId: string, genreIds: string[]) {
  await db.delete(artistGenres).where(eq(artistGenres.artistId, artistId));
  if (genreIds.length) await db.insert(artistGenres).values(genreIds.map((genreId) => ({ artistId, genreId })));
}

export async function listArtistsAdmin(
  db: Db,
  actor: Actor | null,
  q: { search?: string; featured?: boolean; includeDeleted?: boolean; page?: number } = {},
): Promise<{ items: (ArtistRow & { genres: string[] })[]; total: number; pageSize: number }> {
  assertCan(actor, "artist:read");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const term = q.search?.trim();
  const where = and(
    q.includeDeleted ? undefined : isNull(artists.deletedAt),
    q.featured === undefined ? undefined : eq(artists.featured, q.featured),
    term ? ilike(artists.name, `%${likeEscape(term)}%`) : undefined,
  );
  const [rows, [{ c }]] = await Promise.all([
    db
      .select()
      .from(artists)
      .where(where)
      .orderBy(asc(artists.name))
      .limit(ARTIST_PAGE_SIZE)
      .offset((page - 1) * ARTIST_PAGE_SIZE),
    db.select({ c: sql<number>`count(*)` }).from(artists).where(where),
  ]);
  const links = rows.length
    ? await db
        .select({ artistId: artistGenres.artistId, name: genres.name })
        .from(artistGenres)
        .innerJoin(genres, eq(genres.id, artistGenres.genreId))
        .where(inArray(artistGenres.artistId, rows.map((r) => r.id)))
    : [];
  return {
    items: rows.map((r) => ({ ...r, genres: links.filter((l) => l.artistId === r.id).map((l) => l.name) })),
    total: Number(c),
    pageSize: ARTIST_PAGE_SIZE,
  };
}

/** Un artista (también si está borrado, para poder restaurarlo) con sus géneros y la URL de su foto. */
export async function getArtistAdmin(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "artist:read");
  const [row] = await db
    .select({ artist: artists, photoKey: media.storageKey })
    .from(artists)
    .leftJoin(media, eq(media.id, artists.photoId))
    .where(eq(artists.id, id))
    .limit(1);
  if (!row) return null;
  const gl = await db.select({ genreId: artistGenres.genreId }).from(artistGenres).where(eq(artistGenres.artistId, id));
  return { ...row.artist, genreIds: gl.map((g) => g.genreId), photoUrl: row.photoKey ? `/media/${row.photoKey}` : null };
}

export async function createArtist(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string; slug: string }> {
  assertCan(actor, "artist:create");
  const input = artistInputSchema.parse(raw);
  const slug = await uniqueSlug(db, artists, input.slug ?? slugify(input.name), "artista");
  const [row] = await db
    .insert(artists)
    .values({
      slug,
      name: input.name,
      bio: input.bio,
      country: input.country,
      photoId: input.photoId,
      coverArt: input.coverArt,
      links: input.links,
      featured: input.featured,
    })
    .returning({ id: artists.id, slug: artists.slug });
  await setGenres(db, row.id, input.genreIds);
  await recordAudit(db, { userId: actor.id, action: "artist.create", entity: "artist", entityId: row.id });
  return row;
}

export async function updateArtist(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
  assertCan(actor, "artist:update");
  const input = artistInputSchema.parse(raw);
  const [current] = await db.select().from(artists).where(and(eq(artists.id, id), isNull(artists.deletedAt))).limit(1);
  if (!current) throw new DomainError("not_found", "Artista no encontrado");
  await db
    .update(artists)
    .set({
      name: input.name,
      slug: input.slug ? await uniqueSlug(db, artists, input.slug, "artista", id) : current.slug,
      bio: input.bio ?? null,
      country: input.country ?? null,
      photoId: input.photoId ?? null,
      coverArt: input.coverArt ?? null,
      links: input.links,
      featured: input.featured,
    })
    .where(eq(artists.id, id));
  await setGenres(db, id, input.genreIds);
  await recordAudit(db, { userId: actor.id, action: "artist.update", entity: "artist", entityId: id });
}

/** Borrado lógico: el artista deja de mostrarse pero se puede restaurar. */
export async function deleteArtist(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "artist:delete");
  const done = await db
    .update(artists)
    .set({ deletedAt: new Date() })
    .where(and(eq(artists.id, id), isNull(artists.deletedAt)))
    .returning({ id: artists.id });
  if (done.length === 0) throw new DomainError("not_found", "Artista no encontrado");
  await recordAudit(db, { userId: actor.id, action: "artist.delete", entity: "artist", entityId: id });
}

export async function restoreArtist(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "artist:delete");
  const done = await db.update(artists).set({ deletedAt: null }).where(eq(artists.id, id)).returning({ id: artists.id });
  if (done.length === 0) throw new DomainError("not_found", "Artista no encontrado");
  await recordAudit(db, { userId: actor.id, action: "artist.restore", entity: "artist", entityId: id });
}

/** Todos los artistas visibles (id y nombre) para los selectores de lanzamientos y eventos. */
export async function listArtistOptions(db: Db, actor: Actor | null): Promise<{ id: string; name: string }[]> {
  assertCan(actor, "artist:read");
  return db.select({ id: artists.id, name: artists.name }).from(artists).where(isNull(artists.deletedAt)).orderBy(asc(artists.name));
}
