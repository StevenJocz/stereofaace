import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { dummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";
import { sessions, users, type Role } from "./schema";

export const SESSION_DAYS = 7;

export type SessionUser = Actor & { email: string; name: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Crea un usuario. La contraseña se guarda solo como hash. */
export async function createUser(db: Db, input: { email: string; name: string; role: Role; password: string }) {
  const email = input.email.trim().toLowerCase();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (existing.length) throw new DomainError("email_taken", "Ya existe un usuario con ese correo");
  const [u] = await db
    .insert(users)
    .values({ email, name: input.name.trim(), role: input.role, passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id });
  return u;
}

/** Devuelve el usuario si las credenciales son válidas; nunca revela si el correo existe. */
export async function authenticate(db: Db, email: string, password: string): Promise<SessionUser | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  const stored = u?.passwordHash ?? (await dummyHash());
  const ok = await verifyPassword(password, stored);
  if (!u || !u.active || !u.passwordHash || !ok) return null;
  return { id: u.id, role: u.role, email: u.email, name: u.name };
}

/** Crea una sesión y devuelve el token en claro (solo viaja en la cookie HttpOnly; en la BD queda su hash). */
export async function createSession(db: Db, userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) });
  // Limpieza oportunista de sesiones vencidas de esta persona.
  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  return { token, expiresAt };
}

export async function getSessionUser(db: Db, token: string): Promise<SessionUser | null> {
  const [row] = await db
    .select({ id: users.id, role: users.role, email: users.email, name: users.name, active: users.active })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.active) return null;
  return { id: row.id, role: row.role, email: row.email, name: row.name };
}

export async function destroySession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export type { Role };
