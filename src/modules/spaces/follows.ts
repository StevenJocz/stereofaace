import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { spaceFollows, spaceProfiles } from "./schema";
import { normalizeUsername } from "./username";

/** Tope de cuentas que una persona puede seguir (contra el abuso). */
export const MAX_FOLLOWING = 500;

export type FollowCounts = { followers: number; following: number };

/**
 * Cuántas personas siguen a `userId` y a cuántas sigue. Solo cuentan las cuentas con Space público: un borrador o un perfil
 * desactivado por la administración (aunque la relación exista) no infla ni resta números, y así el número coincide con la lista que se ve.
 */
export async function followCounts(db: Db, userId: string): Promise<FollowCounts> {
  const [{ followers }] = await db
    .select({ followers: sql<number>`count(*)` })
    .from(spaceFollows)
    .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceFollows.followerId))
    .where(and(eq(spaceFollows.followedId, userId), eq(spaceProfiles.status, "published")));
  const [{ following }] = await db
    .select({ following: sql<number>`count(*)` })
    .from(spaceFollows)
    .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceFollows.followedId))
    .where(and(eq(spaceFollows.followerId, userId), eq(spaceProfiles.status, "published")));
  return { followers: Number(followers), following: Number(following) };
}

export async function isFollowing(db: Db, followerId: string, followedId: string): Promise<boolean> {
  const [row] = await db.select({ x: spaceFollows.followerId }).from(spaceFollows).where(and(eq(spaceFollows.followerId, followerId), eq(spaceFollows.followedId, followedId))).limit(1);
  return Boolean(row);
}

async function target(db: Db, usernameRaw: string) {
  const username = normalizeUsername(usernameRaw);
  const [p] = await db.select({ userId: spaceProfiles.userId, status: spaceProfiles.status }).from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${username}`);
  // Solo se sigue a Spaces públicos: un borrador o uno desactivado «no existe» para los demás.
  if (!p || p.status !== "published") throw new DomainError("not_found", "Ese Space no existe.");
  return p.userId;
}

/** Seguir es idempotente: si ya lo sigue, no pasa nada. */
export async function follow(db: Db, followerId: string, usernameRaw: string): Promise<FollowCounts & { following: number }> {
  const [mine] = await db.select({ id: spaceProfiles.userId, status: spaceProfiles.status }).from(spaceProfiles).where(eq(spaceProfiles.userId, followerId));
  if (!mine) throw new DomainError("no_profile", "Crea tu Space para poder seguir a otras personas.");
  if (mine.status === "disabled") throw new DomainError("space_disabled", "Tu Space está desactivado: no puedes seguir a otras personas.");
  const followedId = await target(db, usernameRaw);
  if (followedId === followerId) throw new DomainError("self_follow", "No puedes seguirte a ti misma o a ti mismo.");
  if (!(await isFollowing(db, followerId, followedId))) {
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(spaceFollows).where(eq(spaceFollows.followerId, followerId));
    if (Number(c) >= MAX_FOLLOWING) throw new DomainError("follow_limit", `Llegaste al máximo de ${MAX_FOLLOWING} cuentas seguidas.`);
    await db.insert(spaceFollows).values({ followerId, followedId }).onConflictDoNothing();
  }
  return followCounts(db, followedId);
}

/** Dejar de seguir también es idempotente. Devuelve los números nuevos de la persona dejada de seguir. */
export async function unfollow(db: Db, followerId: string, usernameRaw: string): Promise<FollowCounts> {
  const username = normalizeUsername(usernameRaw);
  const [p] = await db.select({ userId: spaceProfiles.userId }).from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${username}`);
  if (!p) throw new DomainError("not_found", "Ese Space no existe.");
  await db.delete(spaceFollows).where(and(eq(spaceFollows.followerId, followerId), eq(spaceFollows.followedId, p.userId)));
  return followCounts(db, p.userId);
}

/** Cuáles de estas cuentas sigue `followerId` (para marcar «Siguiendo» en listados). */
export async function followingAmong(db: Db, followerId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: spaceFollows.followedId }).from(spaceFollows).where(and(eq(spaceFollows.followerId, followerId), inArray(spaceFollows.followedId, ids)));
  return new Set(rows.map((r) => r.id));
}
