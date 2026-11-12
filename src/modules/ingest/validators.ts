import { z } from "zod";
import { publicHttpUrlSchema } from "@/lib/validation";
import { PUBLISH_POLICIES, RIGHTS_POLICIES, SOURCE_KINDS } from "./schema";

/**
 * Reglas de dominio de una fuente externa (motor de noticias):
 *  - Nace desactivada; solo se activa si alguien verificó términos y licencia (`termsVerifiedAt`).
 *  - La publicación automática exige esa misma verificación.
 *  - La URL debe ser pública (anti-SSRF).
 */
export const sourceInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    kind: z.enum(SOURCE_KINDS),
    url: publicHttpUrlSchema,
    intervalMinutes: z
      .number()
      .int()
      .min(15)
      .max(24 * 60)
      .default(60),
    defaultCategoryId: z.uuid().optional(),
    rightsPolicy: z.enum(RIGHTS_POLICIES).default("metadata_only"),
    publishPolicy: z.enum(PUBLISH_POLICIES).default("always_review"),
    active: z.boolean().default(false),
    dailyLimit: z.number().int().min(1).max(500).default(20),
    termsVerifiedAt: z.coerce.date().optional(),
    legalNotes: z.string().trim().max(4000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.active && !v.termsVerifiedAt)
      ctx.addIssue({
        code: "custom",
        path: ["active"],
        message: "Verifica términos y licencia antes de activar la fuente",
      });
    if (v.publishPolicy === "autopublish" && !v.termsVerifiedAt)
      ctx.addIssue({
        code: "custom",
        path: ["publishPolicy"],
        message: "La publicación automática exige términos verificados",
      });
  });
export type SourceInput = z.infer<typeof sourceInputSchema>;
