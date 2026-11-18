import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { DomainError } from "@/lib/errors";
import { sessions, users } from "@/modules/users/schema";
import { passwordSchema } from "@/modules/users/admin-validators";
import { DEFAULT_THEMES } from "./defaults";
import type { Mailer } from "./mailer";
import { authTokens, spaceProfiles } from "./schema";
import { usernameSchema } from "./username";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const VERIFY_TTL_MS = 48 * 3600_000;
const RESET_TTL_MS = 60 * 60_000;

export const registerSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email("Escribe un correo válido")),
  password: passwordSchema,
  username: usernameSchema,
});

export type AccountDeps = { mailer: Mailer; siteUrl: string };

/** Crea un token de un solo uso (solo se guarda su hash) y borra los anteriores sin usar de esa persona y tipo. */
async function issueToken(db: Db, userId: string, kind: "verify" | "reset", ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.kind, kind), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({ userId, kind, tokenHash: sha(token), expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Canjea un token válido, sin vencer y sin usar. Devuelve a quién pertenece. */
async function consumeToken(db: Db, token: string, kind: "verify" | "reset"): Promise<string> {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha(token)), eq(authTokens.kind, kind), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  if (!row) throw new DomainError("token_invalid", "El enlace no es válido, ya se usó o venció. Pide uno nuevo.");
  return row.userId;
}

async function sendVerification(db: Db, userId: string, email: string, deps: AccountDeps): Promise<void> {
  if (!deps.mailer.configured) return;
  const token = await issueToken(db, userId, "verify", VERIFY_TTL_MS);
  await deps.mailer.send({
    to: email,
    subject: "Confirma tu correo en StereoFace Spaces",
    text: `Hola. Confirma tu correo para publicar tu Space:\n\n${deps.siteUrl}/spaces/verificar?token=${token}\n\nEl enlace vale 48 horas. Si no creaste una cuenta, ignora este mensaje.`,
  });
}

/**
 * Registro público: crea la cuenta (rol «oyente», sin acceso al panel de administración) y su perfil en borrador.
 * Reutiliza la tabla de usuarios y las sesiones del sitio; no hay un sistema de autenticación paralelo.
 */
export async function registerListener(db: Db, raw: unknown, deps: AccountDeps): Promise<{ userId: string; verificationSent: boolean }> {
  const input = registerSchema.parse(raw);
  const email = input.email.toLowerCase();
  const [mail] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (mail) throw new DomainError("email_taken", "Ya existe una cuenta con ese correo.");
  const [name] = await db.select({ userId: spaceProfiles.userId }).from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${input.username}`).limit(1);
  if (name) throw new DomainError("username_taken", "Ese nombre de usuario ya está en uso.");

  const [u] = await db.insert(users).values({ email, name: input.username, role: "oyente", passwordHash: await hashPassword(input.password) }).returning({ id: users.id });
  try {
    await db.insert(spaceProfiles).values({ userId: u.id, username: input.username, displayName: input.username, draftDesign: DEFAULT_THEMES[0].design });
  } catch {
    // Dos registros a la vez con el mismo nombre: la base lo impide; se deshace la cuenta a medias.
    await db.delete(users).where(eq(users.id, u.id));
    throw new DomainError("username_taken", "Ese nombre de usuario ya está en uso.");
  }
  let verificationSent = false;
  try {
    await sendVerification(db, u.id, email, deps);
    verificationSent = deps.mailer.configured;
  } catch {
    /* si el correo falla, la cuenta existe igual; se puede reenviar después */
  }
  return { userId: u.id, verificationSent };
}

export async function verifyEmail(db: Db, token: string): Promise<void> {
  const userId = await consumeToken(db, token, "verify");
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}

export async function resendVerification(db: Db, userId: string, deps: AccountDeps): Promise<void> {
  if (!deps.mailer.configured) throw new DomainError("mail_off", "El envío de correos aún no está activado en StereoFace.");
  const [u] = await db.select({ email: users.email, verified: users.emailVerifiedAt }).from(users).where(eq(users.id, userId));
  if (!u) throw new DomainError("not_found", "Cuenta no encontrada.");
  if (u.verified) return;
  await sendVerification(db, userId, u.email, deps);
}

/** Pide un enlace para restablecer la contraseña. Responde siempre igual: no revela si el correo tiene cuenta. */
export async function requestPasswordReset(db: Db, emailRaw: string, deps: AccountDeps): Promise<{ available: boolean }> {
  if (!deps.mailer.configured) return { available: false };
  const email = emailRaw.trim().toLowerCase();
  const [u] = await db.select({ id: users.id, active: users.active, role: users.role }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  // Solo cuentas de oyentes: el personal del administrador cambia su clave con quien administra el sitio.
  if (u?.active && u.role === "oyente") {
    try {
      const token = await issueToken(db, u.id, "reset", RESET_TTL_MS);
      await deps.mailer.send({
        to: email,
        subject: "Restablece tu contraseña de StereoFace Spaces",
        text: `Usa este enlace para elegir una contraseña nueva:\n\n${deps.siteUrl}/spaces/restablecer?token=${token}\n\nVale 1 hora. Si no lo pediste, ignora este mensaje: tu contraseña no cambia.`,
      });
    } catch {
      /* no se distingue el fallo para no revelar nada */
    }
  }
  return { available: true };
}

/** Fija la contraseña nueva con el token y cierra todas las sesiones abiertas de esa persona. */
export async function resetPassword(db: Db, token: string, passwordRaw: string): Promise<void> {
  const password = passwordSchema.parse(passwordRaw);
  const userId = await consumeToken(db, token, "reset");
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
