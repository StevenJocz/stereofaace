import { z } from "zod";

/** Correo del suscriptor: se normaliza (recorte y minúsculas) antes de validar. */
export const subscribeInputSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Escribe un correo válido")),
  locale: z.enum(["es", "en"]).default("es"),
});
export type SubscribeInput = z.infer<typeof subscribeInputSchema>;
