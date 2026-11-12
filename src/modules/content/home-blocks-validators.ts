import { z } from "zod";
import { HOME_BLOCK_KINDS } from "./schema";

const short = (max: number) => z.string().trim().min(1).max(max);

/** Datos de presentación de un slide del hero. Los textos vacíos no se guardan. */
export const heroConfigSchema = z.object({
  lines: z.array(short(60)).max(8).optional(),
  /** Primera línea (desde 0) que va en color de acento; sin valor, solo la última. */
  accentFrom: z.number().int().min(0).max(7).optional(),
  phrase: z.string().trim().max(160).optional(),
  /** «Ciudad · País»: cada parte va en su propia línea de la etiqueta. */
  place: z.string().trim().max(80).optional(),
  cta: short(30).optional(),
  meta: z.string().trim().max(60).optional(),
  path: z.tuple([short(30), short(30), short(30)]).optional(),
  figure: z.boolean().optional(),
});
export type HeroConfigInput = z.infer<typeof heroConfigSchema>;

export const homeBlockInputSchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(HOME_BLOCK_KINDS),
  articleId: z.uuid(),
  config: heroConfigSchema.optional(),
  active: z.boolean().optional(),
});
export type HomeBlockInput = z.infer<typeof homeBlockInputSchema>;
