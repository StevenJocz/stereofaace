import { z } from "zod";
import { slugSchema } from "@/lib/validation";

export const GENRE_FAMILIES = ["electronica", "indie", "otros"] as const;

/** Entrada única para categorías, etiquetas y géneros: cada tipo usa solo los campos que le corresponden. */
export const taxonomyInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional(),
  description: z.string().trim().max(300).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Usa el formato #RRGGBB")
    .optional(),
  position: z.coerce.number().int().min(0).max(999).optional(),
  family: z.enum(GENRE_FAMILIES).optional(),
});
export type TaxonomyInput = z.infer<typeof taxonomyInputSchema>;
