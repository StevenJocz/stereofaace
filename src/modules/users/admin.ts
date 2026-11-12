import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, assertCan, canAssignRole, type Actor } from "@/lib/rbac";
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

export async function createUserAdmin(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string }> {
  assertCan(actor, "user:create");
  const input = createUserSchema.parse(raw);
  if (!canAssignRole(actor, input.role)) throw new ForbiddenError("user:assign-role");
  const created = await createUser(db, input);
  await recordAudit(db, { userId: actor.id, action: "user.create", entity: "user", entityId: created.id, diff: { role: input.role } });
  return created;
}

/**
 * Cambia nombre, rol o estado. Reglas: nadie deja al sistema sin superadmin activo; nadie cambia su propio rol
 * ni se desactiva; solo se gestiona a quien tenga un rol inferior (el superadmin, a cualquiera).
 */
export async function updateUserAdmin(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
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

  await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
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
