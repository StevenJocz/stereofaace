import { z } from "zod";

/**
 * Portada generativa (marcador de posición mientras no exista fotografía propia o licenciada).
 * Se guarda como JSON en cada entidad con portada y se renderiza con `ui/Art`.
 */
export const SCENES = ["crowd", "vinyl", "dj", "wave", "peaks", "rings", "halftone", "grid"] as const;
export const TONES = ["acid", "violet", "mono"] as const;

export type Scene = (typeof SCENES)[number];
export type Tone = (typeof TONES)[number];

export const coverArtSchema = z.object({
  scene: z.enum(SCENES),
  tone: z.enum(TONES),
  seed: z.number().int().min(0).max(1_000_000),
});
export type CoverArt = z.infer<typeof coverArtSchema>;
