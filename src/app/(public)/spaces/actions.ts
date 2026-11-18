"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { endSession, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";
import { createSpaceForUser, registerListener, requestPasswordReset, resendVerification, resetPassword, verifyEmail, type AccountDeps } from "@/modules/spaces/accounts";
import { createMailer } from "@/modules/spaces/mailer";
import { recordAudit } from "@/modules/users/audit";
import { SPACES_SESSION_DAYS, authenticate } from "@/modules/users/auth";
import { getCurrentUser } from "@/lib/auth/session";

export type FormState = { message?: string; ok?: boolean } | null;

const deps = (): AccountDeps => ({ mailer: createMailer(), siteUrl: SITE_URL });
const ipOf = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
const field = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const firstIssue = (e: ZodError) => e.issues[0]?.message ?? "Revisa los datos.";

export async function registerAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ip = await ipOf();
  if (!rateLimit(`spaces:register:${ip}`, 8, 3600_000).ok) return { message: "Demasiados registros desde tu conexión. Inténtalo más tarde." };
  if (field(fd, "terms") !== "on") return { message: "Acepta los términos y la política de privacidad para crear tu cuenta." };
  try {
    const r = await registerListener(await getDb(), { email: field(fd, "email"), password: field(fd, "password"), username: field(fd, "username") }, deps());
    await startSession(r.userId, SPACES_SESSION_DAYS);
    await recordAudit(await getDb(), { userId: r.userId, action: "spaces.register", entity: "user", entityId: r.userId, ip });
  } catch (e) {
    if (e instanceof ZodError) return { message: firstIssue(e) };
    if (e instanceof DomainError) return { message: e.message };
    console.error("[spaces/register]", e instanceof Error ? e.name : "error");
    return { message: "No se pudo crear la cuenta. Inténtalo de nuevo." };
  }
  redirect("/spaces/crear");
}

export async function spacesLoginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ip = await ipOf();
  const email = field(fd, "email").trim().toLowerCase();
  const generic = { message: "Correo o contraseña incorrectos." };
  if (!email || !field(fd, "password")) return generic;
  if (!rateLimit(`login:ip:${ip}`, 15, 15 * 60_000).ok || !rateLimit(`login:mail:${email}`, 6, 15 * 60_000).ok) return { message: "Demasiados intentos. Espera unos minutos." };
  const db = await getDb();
  const user = await authenticate(db, email, field(fd, "password"));
  if (!user) {
    await recordAudit(db, { userId: null, action: "login.failed", entity: "session", ip });
    return generic;
  }
  await startSession(user.id, SPACES_SESSION_DAYS);
  await recordAudit(db, { userId: user.id, action: "login", entity: "session", ip });
  // Quien entra por Spaces va a su Space (el personal también); desde ahí tiene el acceso al administrador.
  redirect("/spaces/editar");
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/spaces");
}

/** Cerrar sesión desde el menú del encabezado: vuelve a la portada (no al editor de Spaces). */
export async function logoutFromMenuAction(): Promise<void> {
  await endSession();
  redirect("/");
}

export async function forgotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ip = await ipOf();
  if (!rateLimit(`spaces:forgot:${ip}`, 5, 3600_000).ok) return { message: "Demasiados intentos. Espera un rato." };
  const r = await requestPasswordReset(await getDb(), field(fd, "email"), deps());
  if (!r.available) return { message: "La recuperación por correo aún no está activada. Escribe a StereoFace para que te ayuden." };
  return { ok: true, message: "Si ese correo tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva (vale 1 hora)." };
}

export async function resetAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await resetPassword(await getDb(), field(fd, "token"), field(fd, "password"));
  } catch (e) {
    if (e instanceof ZodError) return { message: firstIssue(e) };
    if (e instanceof DomainError) return { message: e.message };
    return { message: "No se pudo cambiar la contraseña." };
  }
  redirect("/spaces/entrar?listo=1");
}

export async function verifyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await verifyEmail(await getDb(), field(fd, "token"));
    return { ok: true, message: "Correo confirmado. Ya puedes publicar tu Space." };
  } catch (e) {
    return { message: e instanceof DomainError ? e.message : "No se pudo confirmar el correo." };
  }
}

export async function resendAction(): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { message: "Inicia sesión primero." };
  if (!rateLimit(`spaces:resend:${me.id}`, 3, 3600_000).ok) return { message: "Ya pediste varios correos. Espera un rato." };
  try {
    await resendVerification(await getDb(), me.id, deps());
    return { ok: true, message: "Te enviamos un correo nuevo." };
  } catch (e) {
    return { message: e instanceof DomainError ? e.message : "No se pudo enviar el correo." };
  }
}

/** El personal del sitio (ya con cuenta) crea su Space con la misma cuenta, sin registrarse otra vez. */
export async function createStaffSpaceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getCurrentUser();
  if (!me) return { message: "Inicia sesión primero." };
  if (!rateLimit(`spaces:create:${me.id}`, 10, 3600_000).ok) return { message: "Demasiados intentos. Espera un rato." };
  try {
    await createSpaceForUser(await getDb(), me.id, field(fd, "username"));
  } catch (e) {
    if (e instanceof ZodError) return { message: firstIssue(e) };
    if (e instanceof DomainError && e.code !== "space_exists") return { message: e.message };
    if (!(e instanceof DomainError)) return { message: "No se pudo crear tu Space." };
  }
  redirect("/spaces/crear");
}
