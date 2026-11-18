import { and, asc, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { users } from "@/modules/users/schema";
import { designSchema } from "./design";
import { spaceAssets, spaceGenreOptions, spaceProfiles, spaceReports, spaceThemes } from "./schema";

/* Administración de Spaces: todo exige `space:*` (administrador y superadministrador). */

export type AdminSpaceRow = { userId: string; username: string; displayName: string; email: string; status: string; featured: boolean; badge: boolean; verified: boolean; active: boolean; createdAt: string; openReports: number };

export async function listSpacesAdmin(db: Db, actor: Actor | null, q: { q?: string; status?: string; page?: number } = {}): Promise<{ rows: AdminSpaceRow[]; total: number }> {
  assertCan(actor, "space:read");
  const term = (q.q ?? "").trim().slice(0, 60).replace(/[%_\\]/g, "\\$&");
  const where = and(
    term ? or(ilike(spaceProfiles.username, `%${term}%`), ilike(spaceProfiles.displayName, `%${term}%`), ilike(users.email, `%${term}%`)) : undefined,
    q.status && ["draft", "published", "disabled"].includes(q.status) ? eq(spaceProfiles.status, q.status) : undefined,
  );
  const rows = await db
    .select({
      userId: spaceProfiles.userId,
      username: spaceProfiles.username,
      displayName: spaceProfiles.displayName,
      email: users.email,
      status: spaceProfiles.status,
      featured: spaceProfiles.featured,
      badge: sql<boolean>`${spaceProfiles.badgeVerifiedAt} is not null`.mapWith(Boolean),
      verified: users.emailVerifiedAt,
      active: users.active,
      createdAt: users.createdAt,
      openReports: sql<number>`(select count(*) from space_reports r where r.profile_user_id = ${spaceProfiles.userId} and r.status = 'open')`.mapWith(Number),
    })
    .from(spaceProfiles)
    .innerJoin(users, eq(users.id, spaceProfiles.userId))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(50)
    .offset((Math.max(1, q.page ?? 1) - 1) * 50);
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(spaceProfiles).innerJoin(users, eq(users.id, spaceProfiles.userId)).where(where);
  return { rows: rows.map((r) => ({ ...r, verified: Boolean(r.verified), createdAt: r.createdAt.toISOString() })), total: Number(c) };
}

/** Chulo de verificado: lo pueden dar o quitar todos los roles del equipo (cualquiera por encima de oyente). Queda en el registro de auditoría. */
export async function setVerifiedBadge(db: Db, actor: Actor | null, userId: string, verified: boolean): Promise<void> {
  assertCan(actor, "space:verify");
  const [p] = await db
    .update(spaceProfiles)
    .set(verified ? { badgeVerifiedAt: new Date(), badgeVerifiedBy: actor.id } : { badgeVerifiedAt: null, badgeVerifiedBy: null })
    .where(and(eq(spaceProfiles.userId, userId), ne(spaceProfiles.status, "disabled")))
    .returning({ id: spaceProfiles.userId });
  if (!p) throw new DomainError("not_found", "Ese Space no existe o está desactivado.");
  await recordAudit(db, { userId: actor.id, action: verified ? "space.verify" : "space.unverify", entity: "space_profile", entityId: userId });
}

export type VerifyRow = { userId: string; username: string; displayName: string; status: string; badge: boolean };

/** Lista mínima para dar el chulo: sin correos ni datos privados, para que la vea cualquier rol del equipo. */
export async function listSpacesForVerify(db: Db, actor: Actor | null, q: { q?: string } = {}): Promise<VerifyRow[]> {
  assertCan(actor, "space:verify");
  const term = (q.q ?? "").trim().slice(0, 40).replace(/^@/, "").replace(/[%_\\]/g, "\\$&");
  const rows = await db
    .select({
      userId: spaceProfiles.userId,
      username: spaceProfiles.username,
      displayName: spaceProfiles.displayName,
      status: spaceProfiles.status,
      badge: sql<boolean>`${spaceProfiles.badgeVerifiedAt} is not null`.mapWith(Boolean),
    })
    .from(spaceProfiles)
    .where(and(ne(spaceProfiles.status, "disabled"), term ? or(ilike(spaceProfiles.username, `%${term}%`), ilike(spaceProfiles.displayName, `%${term}%`)) : undefined))
    .orderBy(desc(sql`${spaceProfiles.badgeVerifiedAt} is not null`), asc(spaceProfiles.username))
    .limit(50);
  return rows;
}

export async function setFeatured(db: Db, actor: Actor | null, userId: string, featured: boolean): Promise<void> {
  assertCan(actor, "space:update");
  const [p] = await db.update(spaceProfiles).set({ featured }).where(eq(spaceProfiles.userId, userId)).returning({ id: spaceProfiles.userId });
  if (!p) throw new DomainError("not_found", "Ese Space no existe.");
  await recordAudit(db, { userId: actor.id, action: featured ? "space.feature" : "space.unfeature", entity: "space_profile", entityId: userId });
}

/** Desactiva un Space que incumple las normas (deja de ser público y sus imágenes dejan de servirse) o lo reactiva como borrador. */
export async function setDisabled(db: Db, actor: Actor | null, userId: string, disabled: boolean, reason?: string): Promise<void> {
  assertCan(actor, "space:update");
  const [p] = await db.update(spaceProfiles).set(disabled ? { status: "disabled", featured: false } : { status: "draft" }).where(eq(spaceProfiles.userId, userId)).returning({ id: spaceProfiles.userId });
  if (!p) throw new DomainError("not_found", "Ese Space no existe.");
  await recordAudit(db, { userId: actor.id, action: disabled ? "space.disable" : "space.enable", entity: "space_profile", entityId: userId, diff: reason ? { reason: reason.slice(0, 200) } : undefined });
}

export async function flagAsset(db: Db, actor: Actor | null, assetId: string, flagged: boolean): Promise<void> {
  assertCan(actor, "space:update");
  const [a] = await db.update(spaceAssets).set({ status: flagged ? "flagged" : "ok" }).where(eq(spaceAssets.id, assetId)).returning({ id: spaceAssets.id });
  if (!a) throw new DomainError("not_found", "Esa imagen no existe.");
  await recordAudit(db, { userId: actor.id, action: flagged ? "space.asset.flag" : "space.asset.unflag", entity: "space_asset", entityId: assetId });
}

export async function listReports(db: Db, actor: Actor | null, status: "open" | "closed" = "open") {
  assertCan(actor, "space:read");
  return db
    .select({ id: spaceReports.id, reason: spaceReports.reason, detail: spaceReports.detail, status: spaceReports.status, createdAt: spaceReports.createdAt, userId: spaceReports.profileUserId, username: spaceProfiles.username })
    .from(spaceReports)
    .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceReports.profileUserId))
    .where(eq(spaceReports.status, status))
    .orderBy(desc(spaceReports.createdAt))
    .limit(100);
}

export async function closeReport(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "space:update");
  await db.update(spaceReports).set({ status: "closed" }).where(eq(spaceReports.id, id));
  await recordAudit(db, { userId: actor.id, action: "space.report.close", entity: "space_report", entityId: id });
}

/* Géneros y plantillas */

const genreSchema = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa minúsculas, números y guiones").max(40), name: z.string().trim().min(1).max(40) });

export async function listGenreOptionsAdmin(db: Db, actor: Actor | null) {
  assertCan(actor, "space:read");
  return db.select().from(spaceGenreOptions).orderBy(asc(spaceGenreOptions.position), asc(spaceGenreOptions.name));
}
export async function addGenreOption(db: Db, actor: Actor | null, raw: unknown): Promise<void> {
  assertCan(actor, "space:manage");
  const g = genreSchema.parse(raw);
  const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(spaceGenreOptions);
  try {
    await db.insert(spaceGenreOptions).values({ ...g, position: Number(c) });
  } catch {
    throw new DomainError("genre_exists", "Ya existe un género con ese identificador.");
  }
  await recordAudit(db, { userId: actor.id, action: "space.genre.add", entity: "space_genre", diff: { slug: g.slug } });
}
export async function setGenreActive(db: Db, actor: Actor | null, id: string, active: boolean): Promise<void> {
  assertCan(actor, "space:manage");
  await db.update(spaceGenreOptions).set({ active }).where(eq(spaceGenreOptions.id, id));
  await recordAudit(db, { userId: actor.id, action: "space.genre.active", entity: "space_genre", entityId: id, diff: { active } });
}

export async function listThemesAdmin(db: Db, actor: Actor | null) {
  assertCan(actor, "space:read");
  return db.select({ id: spaceThemes.id, slug: spaceThemes.slug, name: spaceThemes.name, description: spaceThemes.description, active: spaceThemes.active }).from(spaceThemes).orderBy(asc(spaceThemes.position));
}
export async function setThemeActive(db: Db, actor: Actor | null, id: string, active: boolean): Promise<void> {
  assertCan(actor, "space:manage");
  if (!active) {
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(spaceThemes).where(and(eq(spaceThemes.active, true), sql`${spaceThemes.id} <> ${id}`));
    if (Number(c) < 1) throw new DomainError("last_theme", "Debe quedar al menos una plantilla activa.");
  }
  await db.update(spaceThemes).set({ active }).where(eq(spaceThemes.id, id));
  await recordAudit(db, { userId: actor.id, action: "space.theme.active", entity: "space_theme", entityId: id, diff: { active } });
}
/** Edita el nombre, la descripción y el diseño de una plantilla (el diseño se valida igual que el de cualquier Space). */
export async function updateTheme(db: Db, actor: Actor | null, id: string, raw: { name?: unknown; description?: unknown; design?: unknown }): Promise<void> {
  assertCan(actor, "space:manage");
  const set: Partial<typeof spaceThemes.$inferInsert> = {};
  if (raw.name !== undefined) set.name = z.string().trim().min(1).max(40).parse(raw.name);
  if (raw.description !== undefined) set.description = z.string().trim().max(160).parse(raw.description);
  if (raw.design !== undefined) set.design = designSchema.parse(raw.design);
  if (!Object.keys(set).length) return;
  await db.update(spaceThemes).set(set).where(eq(spaceThemes.id, id));
  await recordAudit(db, { userId: actor.id, action: "space.theme.update", entity: "space_theme", entityId: id });
}
