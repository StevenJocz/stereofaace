import type { Db } from "@/lib/db";
import { subscribers } from "./schema";
import { subscribeInputSchema } from "./validators";

export type SubscribeResult = { status: "created" | "exists" };

/**
 * Registra una suscripción como «pendiente»: el correo de confirmación (doble opt-in) lo envía el worker
 * cuando haya proveedor de correo configurado. Un correo repetido no revela si ya existía de forma distinta
 * a «exists», y no se sobreescribe el estado de quien ya confirmó o se dio de baja.
 */
export async function subscribe(db: Db, raw: unknown, source = "web"): Promise<SubscribeResult> {
  const input = subscribeInputSchema.parse(raw);
  const inserted = await db
    .insert(subscribers)
    .values({ email: input.email, locale: input.locale, source })
    .onConflictDoNothing()
    .returning({ id: subscribers.id });
  return { status: inserted.length > 0 ? "created" : "exists" };
}
