import { z } from "zod";
import { httpsUrlSchema, slugSchema } from "@/lib/validation";
import { coverArtSchema } from "@/modules/media/cover-art";
import { RELEASE_KINDS } from "./schema";

/**
 * Reproductores oficiales permitidos. Solo se incrusta contenido servido por el proveedor;
 * no se aloja ni se reproduce audio propio sin autorización.
 */
export const EMBED_HOSTS = [
  "open.spotify.com",
  "soundcloud.com",
  "w.soundcloud.com",
  "bandcamp.com",
  "youtube.com",
  "www.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "music.apple.com",
  "embed.music.apple.com",
  "mixcloud.com",
  "www.mixcloud.com",
] as const;

export function isAllowedEmbedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return EMBED_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

export const embedUrlSchema = httpsUrlSchema.refine(
  (u) => isAllowedEmbedHost(new URL(u).hostname),
  "Proveedor de reproductor no permitido",
);

export const releaseInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema.optional(),
  kind: z.enum(RELEASE_KINDS),
  releasedAt: z.coerce.date(),
  label: z.string().trim().max(120).optional(),
  artistIds: z.array(z.uuid()).min(1).max(10),
  coverId: z.uuid().optional(),
  coverArt: coverArtSchema.optional(),
  embedUrl: embedUrlSchema.optional(),
  status: z.enum(["draft", "published"]).default("draft"),
});
export type ReleaseInput = z.infer<typeof releaseInputSchema>;
