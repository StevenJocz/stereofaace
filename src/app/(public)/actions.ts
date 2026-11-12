"use server";

import { headers } from "next/headers";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { subscribe } from "@/modules/settings/service";
import { subscribeInputSchema } from "@/modules/settings/validators";

export type SubscribeState = { ok: boolean; message: string } | null;

/**
 * Suscripción al newsletter. Valida con Zod, limita intentos por IP y responde igual si el correo ya
 * existía (no permite averiguar quién está suscrito).
 */
export async function subscribeAction(_prev: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const limit = rateLimit(`subscribe:${ip}`, 5, 10 * 60 * 1000);
  if (!limit.ok) return { ok: false, message: "Demasiados intentos. Prueba de nuevo en unos minutos." };

  const parsed = subscribeInputSchema.safeParse({ email: formData.get("email"), locale: "es" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Correo no válido" };

  try {
    await subscribe(await getDb(), parsed.data);
  } catch (error) {
    console.error("[subscribe]", error);
    return { ok: false, message: "No pudimos registrar tu correo ahora. Inténtalo más tarde." };
  }
  return {
    ok: true,
    message: "Registramos tu correo. Falta confirmarlo: el envío de correos aún no está configurado en este entorno.",
  };
}
