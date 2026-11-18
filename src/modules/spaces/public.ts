import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { artists } from "@/modules/artists/schema";
import { media } from "@/modules/media/schema";
import { users } from "@/modules/users/schema";
import { DEFAULT_PRIVACY, REPORT_REASONS, spaceAssets, spaceFollows, spaceFavoriteArtists, spaceGenreOptions, spaceProfileGenres, spaceProfiles, spaceReports, type SpaceLinks } from "./schema";
import { assetUrl } from "./profile";
import { normalizeDesign, type SpaceDesign } from "./design";
import { followCounts, isFollowing } from "./follows";
import { normalizeUsername } from "./username";
import { z } from "zod";

export type PublicSpace = {
  username: string;
  displayName: string;
  tagline: string | null;
  bio: string | null;
  location: string | null;
  joinedAt: string | null;
  links: SpaceLinks;
  genres: { slug: string; name: string }[];
  artists: { name: string; slug: string | null; imageUrl: string | null }[];
  gallery: { url: string; alt: string | null }[];
  avatarUrl: string | null;
  coverUrl: string | null;
  backgroundUrl: string | null;
  design: SpaceDesign;
  featured: boolean;
  /** Chulo de verificado dado por el equipo. */
  verifiedBadge: boolean;
  /** Acepta aparecer en el listado y en buscadores. */
  listed: boolean;
  /** Seguidores y seguidos; `null` si la persona decidió no mostrarlos. */
  follows: { followers: number; following: number } | null;
  /** Quien mira ya sigue a esta persona. */
  viewerFollows: boolean;
  /** Quien mira tiene una cuenta con sesión iniciada. */
  viewerSignedIn: boolean;
  /** Es el propio dueño viendo su Space (puede ver el borrador). */
  isOwner: boolean;
  isDraftPreview: boolean;
};

/**
 * Vista pública de un Space, ya filtrada por la privacidad de su dueño. Un Space en borrador o desactivado solo lo ve su dueño
 * (borrador); para el resto no existe. `null` si no hay nada que mostrar.
 */
export async function getPublicSpace(db: Db, usernameRaw: string, viewer: { id: string } | null, opts: { preview?: boolean } = {}): Promise<PublicSpace | null> {
  const username = normalizeUsername(usernameRaw);
  if (!/^[a-z0-9][a-z0-9_]{2,19}$/.test(username)) return null;
  const [p] = await db.select().from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${username}`);
  if (!p) return null;
  const isOwner = viewer?.id === p.userId;
  const published = p.status === "published";
  if (!published && !(isOwner && p.status !== "disabled")) return null;
  const useDraft = isOwner && (opts.preview || !published);
  const rawDesign = useDraft ? (p.draftDesign ?? p.publishedDesign) : p.publishedDesign;
  if (!rawDesign) return null;
  const design = normalizeDesign(rawDesign);
  const privacy = { ...DEFAULT_PRIVACY, ...p.privacy };

  const [u, genreRows, artistRows, assets, counts, viewerFollows] = await Promise.all([
    db.select({ createdAt: users.createdAt }).from(users).where(eq(users.id, p.userId)),
    db.select({ slug: spaceGenreOptions.slug, name: spaceGenreOptions.name }).from(spaceProfileGenres).innerJoin(spaceGenreOptions, eq(spaceGenreOptions.id, spaceProfileGenres.genreId)).where(eq(spaceProfileGenres.userId, p.userId)).orderBy(asc(spaceProfileGenres.position)),
    db
      .select({ name: spaceFavoriteArtists.name, slug: artists.slug, photoKey: media.storageKey })
      .from(spaceFavoriteArtists)
      .leftJoin(artists, eq(artists.id, spaceFavoriteArtists.artistId))
      .leftJoin(media, eq(media.id, artists.photoId))
      .where(eq(spaceFavoriteArtists.userId, p.userId))
      .orderBy(asc(spaceFavoriteArtists.position)),
    db.select().from(spaceAssets).where(and(eq(spaceAssets.userId, p.userId), eq(spaceAssets.status, "ok"))).orderBy(asc(spaceAssets.position)),
    followCounts(db, p.userId),
    viewer && !isOwner ? isFollowing(db, viewer.id, p.userId) : Promise.resolve(false),
  ]);
  const url = (id: string | null) => {
    const a = assets.find((x) => x.id === id);
    return a ? assetUrl(a.storageKey) : null;
  };
  return {
    username: p.username,
    displayName: p.displayName,
    tagline: p.tagline,
    bio: p.bio,
    location: privacy.showLocation ? p.location : null,
    joinedAt: privacy.showJoined ? (u[0]?.createdAt ?? p.createdAt).toISOString() : null,
    links: privacy.showLinks ? p.links : {},
    genres: genreRows,
    artists: privacy.showFavorites ? artistRows.map((a) => ({ name: a.name, slug: a.slug, imageUrl: a.photoKey ? `/media/${a.photoKey}` : null })) : [],
    gallery: assets.filter((a) => a.kind === "gallery").map((a) => ({ url: assetUrl(a.storageKey), alt: a.alt })),
    avatarUrl: url(p.avatarAssetId),
    coverUrl: url(p.coverAssetId),
    backgroundUrl: design.background.assetId ? url(design.background.assetId) : null,
    design,
    featured: p.featured,
    verifiedBadge: p.badgeVerifiedAt !== null,
    listed: privacy.listed,
    follows: privacy.showFollows || isOwner ? counts : null,
    viewerFollows,
    viewerSignedIn: viewer !== null,
    isOwner,
    isDraftPreview: useDraft,
  };
}

export type SpaceCard = { username: string; displayName: string; tagline: string | null; avatarUrl: string | null; genres: string[]; featured: boolean; verifiedBadge: boolean };
const PAGE = 24;

/** Descubrimiento: solo Spaces publicados, activos y que aceptan aparecer en el listado. */
export async function listSpaces(db: Db, q: { q?: string; genre?: string; page?: number } = {}): Promise<{ recent: SpaceCard[]; featured: SpaceCard[]; total: number; page: number }> {
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const term = (q.q ?? "").trim().slice(0, 30).replace(/^@/, "");
  const visible = and(eq(spaceProfiles.status, "published"), sql`coalesce((${spaceProfiles.privacy} ->> 'listed')::boolean, true)`);
  const byName = term ? ilike(spaceProfiles.username, `%${term.replace(/[%_\\]/g, "\\$&")}%`) : undefined;
  const byGenre = q.genre
    ? sql`${spaceProfiles.userId} in (select ${spaceProfileGenres.userId} from ${spaceProfileGenres} inner join ${spaceGenreOptions} on ${spaceGenreOptions.id} = ${spaceProfileGenres.genreId} where ${spaceGenreOptions.slug} = ${q.genre})`
    : undefined;
  const where = and(visible, byName, byGenre);

  const rows = await db
    .select({ p: spaceProfiles, avatarKey: spaceAssets.storageKey })
    .from(spaceProfiles)
    .leftJoin(spaceAssets, and(eq(spaceAssets.id, spaceProfiles.avatarAssetId), eq(spaceAssets.status, "ok")))
    .where(where)
    .orderBy(desc(spaceProfiles.featured), desc(spaceProfiles.publishedAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(spaceProfiles).where(where);
  const ids = rows.map((r) => r.p.userId);
  const genreRows = ids.length ? await db.select({ userId: spaceProfileGenres.userId, name: spaceGenreOptions.name }).from(spaceProfileGenres).innerJoin(spaceGenreOptions, eq(spaceGenreOptions.id, spaceProfileGenres.genreId)).where(inArray(spaceProfileGenres.userId, ids)).orderBy(asc(spaceProfileGenres.position)) : [];
  const cards: SpaceCard[] = rows.map(({ p, avatarKey }) => ({
    username: p.username,
    displayName: p.displayName,
    tagline: p.tagline,
    avatarUrl: avatarKey ? assetUrl(avatarKey) : null,
    genres: genreRows.filter((g) => g.userId === p.userId).slice(0, 3).map((g) => g.name),
    featured: p.featured,
    verifiedBadge: p.badgeVerifiedAt !== null,
  }));
  return { recent: cards.filter((c) => !c.featured), featured: cards.filter((c) => c.featured), total: Number(c), page };
}

export const reportSchema = z.object({
  username: z.string().trim().max(30),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(300).optional(),
});

/** Reporte de un Space público (anónimo o con sesión). El administrador lo revisa en /admin/spaces. */
export async function reportSpace(db: Db, raw: unknown, reporterId: string | null): Promise<void> {
  const input = reportSchema.parse(raw);
  const [p] = await db.select({ userId: spaceProfiles.userId, status: spaceProfiles.status }).from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${normalizeUsername(input.username)}`);
  if (!p || p.status !== "published") throw new DomainError("not_found", "Ese Space no existe.");
  if (reporterId === p.userId) throw new DomainError("self_report", "No puedes reportar tu propio Space.");
  await db.insert(spaceReports).values({ profileUserId: p.userId, reporterId, reason: input.reason, detail: input.detail || null });
}

export type NetworkNode = { username: string; displayName: string; avatarUrl: string | null; genres: string[]; featured: boolean; followers: number | null };
export type Network = { nodes: NetworkNode[]; edges: { from: string; to: string }[]; total: number };

/**
 * «Red de amigos» de la portada: hasta `limit` Spaces públicos (destacados primero) y los seguimientos que hay entre ellos.
 * Solo salen Spaces publicados y que aceptan aparecer en el listado. Un seguimiento se dibuja únicamente si las DOS personas
 * dejaron visibles sus números de seguidores (la opción «mostrar seguidores y seguidos»); si no, la relación no se revela.
 */
export async function getNetwork(db: Db, limit = 9): Promise<Network> {
  const visible = and(eq(spaceProfiles.status, "published"), sql`coalesce((${spaceProfiles.privacy} ->> 'listed')::boolean, true)`);
  const rows = await db
    .select({ p: spaceProfiles, avatarKey: spaceAssets.storageKey })
    .from(spaceProfiles)
    .leftJoin(spaceAssets, and(eq(spaceAssets.id, spaceProfiles.avatarAssetId), eq(spaceAssets.status, "ok")))
    .where(visible)
    .orderBy(desc(spaceProfiles.featured), desc(spaceProfiles.publishedAt))
    .limit(Math.max(1, Math.min(limit, 16)));
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(spaceProfiles).where(visible);
  if (!rows.length) return { nodes: [], edges: [], total: 0 };
  const ids = rows.map((r) => r.p.userId);
  const shows = (r: (typeof rows)[number]) => ({ ...DEFAULT_PRIVACY, ...r.p.privacy }).showFollows;
  const [genreRows, followRows, countRows] = await Promise.all([
    db.select({ userId: spaceProfileGenres.userId, name: spaceGenreOptions.name }).from(spaceProfileGenres).innerJoin(spaceGenreOptions, eq(spaceGenreOptions.id, spaceProfileGenres.genreId)).where(inArray(spaceProfileGenres.userId, ids)).orderBy(asc(spaceProfileGenres.position)),
    db.select({ from: spaceFollows.followerId, to: spaceFollows.followedId }).from(spaceFollows).where(and(inArray(spaceFollows.followerId, ids), inArray(spaceFollows.followedId, ids))),
    db
      .select({ id: spaceFollows.followedId, n: sql<number>`count(*)` })
      .from(spaceFollows)
      .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceFollows.followerId))
      .where(and(inArray(spaceFollows.followedId, ids), eq(spaceProfiles.status, "published")))
      .groupBy(spaceFollows.followedId),
  ]);
  const byId = new Map(rows.map((r) => [r.p.userId, r]));
  const nodes: NetworkNode[] = rows.map((r) => ({
    username: r.p.username,
    displayName: r.p.displayName,
    avatarUrl: r.avatarKey ? assetUrl(r.avatarKey) : null,
    genres: genreRows.filter((g) => g.userId === r.p.userId).slice(0, 2).map((g) => g.name),
    featured: r.p.featured,
    followers: shows(r) ? Number(countRows.find((x) => x.id === r.p.userId)?.n ?? 0) : null,
  }));
  const edges = followRows
    .filter((e) => shows(byId.get(e.from)!) && shows(byId.get(e.to)!))
    .map((e) => ({ from: byId.get(e.from)!.p.username, to: byId.get(e.to)!.p.username }));
  return { nodes, edges, total: Number(c) };
}

export type SpaceStatus = { signedIn: false } | { signedIn: true; hasSpace: false } | { signedIn: true; hasSpace: true; username: string; avatarUrl: string | null; disabled: boolean };

/** Estado mínimo para el menú del encabezado: ¿hay sesión y esa persona ya tiene Space? (sin datos privados). */
export async function getSpaceStatus(db: Db, userId: string | null): Promise<SpaceStatus> {
  if (!userId) return { signedIn: false };
  const [r] = await db
    .select({ username: spaceProfiles.username, status: spaceProfiles.status, avatarKey: spaceAssets.storageKey })
    .from(spaceProfiles)
    .leftJoin(spaceAssets, and(eq(spaceAssets.id, spaceProfiles.avatarAssetId), eq(spaceAssets.status, "ok")))
    .where(eq(spaceProfiles.userId, userId));
  if (!r) return { signedIn: true, hasSpace: false };
  return { signedIn: true, hasSpace: true, username: r.username, avatarUrl: r.avatarKey ? assetUrl(r.avatarKey) : null, disabled: r.status === "disabled" };
}

export type FollowListItem = { username: string; displayName: string; avatarUrl: string | null };
export const FOLLOW_PAGE_SIZE = 30;

/**
 * Lista de quienes siguen a un Space («followers») o a quienes sigue («following»), solo con Spaces públicos y del más reciente
 * al más antiguo. Respeta la privacidad: si la persona ocultó sus números, solo ella puede ver sus listas.
 */
export async function listFollows(
  db: Db,
  q: { username: string; kind: "followers" | "following"; viewerId: string | null; page?: number },
): Promise<{ items: FollowListItem[]; total: number; page: number; pageSize: number }> {
  const username = normalizeUsername(q.username);
  const [p] = await db.select().from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${username}`);
  const isOwner = q.viewerId !== null && q.viewerId === p?.userId;
  if (!p || p.status === "disabled" || (p.status !== "published" && !isOwner)) throw new DomainError("not_found", "Ese Space no existe.");
  if (!isOwner && !{ ...DEFAULT_PRIVACY, ...p.privacy }.showFollows) throw new DomainError("private", "Esta persona no muestra sus seguidores.");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const other = q.kind === "followers" ? spaceFollows.followerId : spaceFollows.followedId;
  const mine = q.kind === "followers" ? spaceFollows.followedId : spaceFollows.followerId;
  const rows = await db
    .select({ username: spaceProfiles.username, displayName: spaceProfiles.displayName, avatarKey: spaceAssets.storageKey })
    .from(spaceFollows)
    .innerJoin(spaceProfiles, and(eq(spaceProfiles.userId, other), eq(spaceProfiles.status, "published")))
    .leftJoin(spaceAssets, and(eq(spaceAssets.id, spaceProfiles.avatarAssetId), eq(spaceAssets.status, "ok")))
    .where(eq(mine, p.userId))
    .orderBy(desc(spaceFollows.createdAt), asc(spaceProfiles.username))
    .limit(FOLLOW_PAGE_SIZE)
    .offset((page - 1) * FOLLOW_PAGE_SIZE);
  const counts = await followCounts(db, p.userId);
  return {
    items: rows.map((r) => ({ username: r.username, displayName: r.displayName, avatarUrl: r.avatarKey ? assetUrl(r.avatarKey) : null })),
    total: q.kind === "followers" ? counts.followers : counts.following,
    page,
    pageSize: FOLLOW_PAGE_SIZE,
  };
}
