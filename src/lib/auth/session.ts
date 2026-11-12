import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";
import { SESSION_DAYS, createSession, destroySession, getSessionUser, type SessionUser } from "@/modules/users/auth";

/** Cookie de sesión: HttpOnly (no la lee JavaScript), SameSite=Lax y Secure en producción. */
export const SESSION_COOKIE = "sf_session";

export async function startSession(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await createSession(await getDb(), userId, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    userAgent: h.get("user-agent") ?? undefined,
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(await getDb(), token);
  jar.delete(SESSION_COOKIE);
}

/** Usuario de la sesión actual, o null. Lee cookies: debe llamarse dentro de un límite Suspense. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  // La validez de la sesión depende del reloj: se resuelve siempre en el momento de la petición.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(await getDb(), token);
}

/** Exige sesión en páginas y acciones de administración; redirige al inicio de sesión si no la hay. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

/**
 * Exige además un permiso concreto (la interfaz oculta controles, pero esto es lo que protege).
 * Sin permiso lleva al panel con un aviso, en vez de mostrar un error.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/admin?denegado=1");
  return user;
}
