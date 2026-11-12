"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/modules/users/audit";
import { authenticate } from "@/modules/users/auth";

export type LoginState = { message: string } | null;

const schema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

/** Solo se redirige a rutas internas del panel (evita redirecciones abiertas). */
function safeNext(next?: string): string {
  return next && next.startsWith("/admin") && !next.startsWith("//") && !next.includes("\\") ? next : "/admin";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const generic = { message: "Correo o contraseña incorrectos." };

  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") || undefined,
  });
  if (!parsed.success) return generic;

  // Límite por IP y por correo: frena la fuerza bruta sin revelar si la cuenta existe.
  const byIp = rateLimit(`login:ip:${ip}`, 15, 15 * 60_000);
  const byMail = rateLimit(`login:mail:${parsed.data.email.toLowerCase()}`, 6, 15 * 60_000);
  if (!byIp.ok || !byMail.ok) return { message: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };

  const db = await getDb();
  const user = await authenticate(db, parsed.data.email, parsed.data.password);
  if (!user) {
    await recordAudit(db, { userId: null, action: "login.failed", entity: "session", ip });
    return generic;
  }
  await startSession(user.id);
  await recordAudit(db, { userId: user.id, action: "login", entity: "session", ip });
  redirect(safeNext(parsed.data.next));
}
