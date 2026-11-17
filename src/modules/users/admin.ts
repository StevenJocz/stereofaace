import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, assertCan, canAssignRole, type Actor } from "@/lib/rbac";
import { radioPrograms } from "@/modules/schedule/schema";
import { syncDjAccount, uniqueDjUsername, type DjSync } from "@/modules/studio/dj-accounts";
import { auditLogs, sessions, users, type Role } from "./schema";
import { createUser } from "./auth";
import { recordAudit } from "./audit";
import { createUserSchema, passwordSchema, updateUserSchema } from "./admin-validators";

export const AUDIT_PAGE_SIZE = 50;

export type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  djUsername: string | null;
  createdAt: Date;
};

/** Lista de usuarios. Nunca incluye el hash de la contraseña. */
export async function listUsers(db: Db, actor: Actor | null): Promise<UserRow[]> {
  assertCan(actor, "user:read");
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      active: users.active,
      djUsername: users.djUsername,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.name));
}

async function getTarget(db: Db, id: string) {
  const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!target) throw new DomainError("not_found", "Usuario no encontrado");
  return target;
}

/**
 * Alta de usuario. Un locutor nace con su programa y su cuenta de DJ en AzuraCast (usuario y clave los pone el sistema,
 * con el horario del programa); si AzuraCast no responde el usuario se crea igual y se devuelve un aviso para reintentar.
 */
export async function createUserAdmin(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string; dj?: DjSync }> {
  assertCan(actor, "user:create");
  const input = createUserSchema.parse(raw);
  if (!canAssignRole(actor, input.role)) throw new ForbiddenError("user:assign-role");
  const locutor = input.role === "locutor";
  if (locutor) {
    if (!input.programId) throw new DomainError("program_required", "Elige el programa que conducirá el locutor.");
    const [p] = await db.select({ id: radioPrograms.id }).from(radioPrograms).where(and(eq(radioPrograms.id, input.programId), isNull(radioPrograms.deletedAt)));
    if (!p) throw new DomainError("program_not_found", "Ese programa ya no existe.");
  }
  const created = await createUser(db, { ...input, djUsername: locutor ? await uniqueDjUsername(db, input.name) : undefined });
  await recordAudit(db, { userId: actor.id, action: "user.create", entity: "user", entityId: created.id, diff: { role: input.role } });
  if (!locutor) return created;
  await assignPrograms(db, actor, created.id, [input.programId!]);
  return { ...created, dj: await syncDjAccount(db, created.id) };
}

/** Programas que conduce un locutor: los marcados quedan a su nombre; los que tenía y ya no están, quedan sin locutor. */
export async function assignPrograms(db: Db, actor: Actor | null, userId: string, programIds: string[]): Promise<DjSync> {
  assertCan(actor, "user:update");
  const target = await getTarget(db, userId);
  if (target.role !== "locutor" || !target.djUsername) throw new DomainError("not_locutor", "Solo un locutor conduce programas.");
  if (userId !== actor.id && !canAssignRole(actor, target.role)) throw new ForbiddenError("user:manage-target");
  const ids = [...new Set(programIds)];
  const live = await db.select({ id: radioPrograms.id, dj: radioPrograms.djUsername }).from(radioPrograms).where(isNull(radioPrograms.deletedAt));
  const known = new Set(live.map((p) => p.id));
  if (ids.some((id) => !known.has(id))) throw new DomainError("program_not_found", "Alguno de los programas ya no existe.");
  const mine = target.djUsername.toLowerCase();
  for (const p of live) {
    const has = p.dj?.toLowerCase() === mine;
    if (ids.includes(p.id) && !has) await db.update(radioPrograms).set({ djUsername: target.djUsername }).where(eq(radioPrograms.id, p.id));
    if (!ids.includes(p.id) && has) await db.update(radioPrograms).set({ djUsername: null }).where(eq(radioPrograms.id, p.id));
  }
  await recordAudit(db, { userId: actor.id, action: "user.programs", entity: "user", entityId: userId, diff: { programs: ids.length } });
  return syncDjAccount(db, userId);
}

/** Vuelve a enviar a AzuraCast la cuenta y el horario de un locutor (para reintentar tras un fallo). */
export async function resyncDj(db: Db, actor: Actor | null, userId: string): Promise<DjSync> {
  assertCan(actor, "user:update");
  const target = await getTarget(db, userId);
  if (userId !== actor.id && !canAssignRole(actor, target.role)) throw new ForbiddenError("user:manage-target");
  return syncDjAccount(db, userId);
}

/**
 * Cambia nombre, rol o estado. Reglas: nadie deja al sistema sin superadmin activo; nadie cambia su propio rol
 * ni se desactiva; solo se gestiona a quien tenga un rol inferior (el superadmin, a cualquiera).
 */
export async function updateUserAdmin(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<{ dj?: DjSync }> {
  assertCan(actor, "user:update");
  const input = updateUserSchema.parse(raw);
  const target = await getTarget(db, id);

  const losesSuperadmin =
    target.role === "superadmin" && target.active && ((input.role && input.role !== "superadmin") || input.active === false);
  if (losesSuperadmin) {
    const [{ c }] = await db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "superadmin"), eq(users.active, true)));
    if (Number(c) <= 1)
      throw new DomainError("last_superadmin", "Debe quedar al menos un superadministrador activo.");
  }

  if (id === actor.id) {
    if ((input.role !== undefined && input.role !== target.role) || input.active === false)
      throw new DomainError("self", "No puedes cambiar tu propio rol ni desactivarte.");
  } else if (!canAssignRole(actor, target.role)) {
    throw new ForbiddenError("user:manage-target");
  }
  if (input.role && input.role !== target.role && !canAssignRole(actor, input.role)) throw new ForbiddenError("user:assign-role");

  const becomesLocutor = input.role === "locutor" && !target.djUsername;
  await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(becomesLocutor ? { djUsername: await uniqueDjUsername(db, input.name ?? target.name) } : {}),
    })
    .where(eq(users.id, id));
  if (input.active === false) await db.delete(sessions).where(eq(sessions.userId, id));
  await recordAudit(db, {
    userId: actor.id,
    action: "user.update",
    entity: "user",
    entityId: id,
    diff: { name: input.name !== undefined, role: input.role, active: input.active },
  });
  // Quien es o fue locutor: su cuenta de DJ se activa, se desactiva o se actualiza según su nuevo estado.
  const touchesDj = becomesLocutor || Boolean(target.djUsername);
  return touchesDj ? { dj: await syncDjAccount(db, id) } : {};
}

/** Fija una contraseña nueva y cierra todas las sesiones de esa persona. */
export async function resetUserPassword(db: Db, actor: Actor | null, id: string, password: string): Promise<void> {
  assertCan(actor, "user:update");
  const valid = passwordSchema.parse(password);
  const target = await getTarget(db, id);
  if (id !== actor.id && !canAssignRole(actor, target.role)) throw new ForbiddenError("user:manage-target");
  await db.update(users).set({ passwordHash: await hashPassword(valid) }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await recordAudit(db, { userId: actor.id, action: "user.password_reset", entity: "user", entityId: id });
}

export async function listAudit(
  db: Db,
  actor: Actor | null,
  q: { entity?: string; userId?: string; from?: Date; to?: Date; page?: number } = {},
) {
  assertCan(actor, "audit:read");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const where = and(
    q.entity ? eq(auditLogs.entity, q.entity) : undefined,
    q.userId ? eq(auditLogs.userId, q.userId) : undefined,
    q.from ? gte(auditLogs.createdAt, q.from) : undefined,
    q.to ? lte(auditLogs.createdAt, q.to) : undefined,
  );
  const [items, [{ c }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entity: auditLogs.entity,
        entityId: auditLogs.entityId,
        userName: users.name,
        createdAt: auditLogs.createdAt,
        diff: auditLogs.diff,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(AUDIT_PAGE_SIZE)
      .offset((page - 1) * AUDIT_PAGE_SIZE),
    db.select({ c: sql<number>`count(*)` }).from(auditLogs).where(where),
  ]);
  return { items, total: Number(c), pageSize: AUDIT_PAGE_SIZE };
}
