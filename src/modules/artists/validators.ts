import { z } from "zod";
import { countrySchema, httpsUrlSchema, slugSchema } from "@/lib/validation";
import { coverArtSchema } from "@/modules/media/cover-art";

export const artistInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema.optional(),
  bio: z.string().trim().max(8000).optional(),
  country: countrySchema.optional(),
  genreIds: z.array(z.uuid()).max(8).default([]),
  photoId: z.uuid().optional(),
  coverArt: coverArtSchema.optional(),
  links: z
    .object({
      spotify: httpsUrlSchema.optional(),
      soundcloud: httpsUrlSchema.optional(),
      bandcamp: httpsUrlSchema.optional(),
      youtube: httpsUrlSchema.optional(),
      instagram: httpsUrlSchema.optional(),
      web: httpsUrlSchema.optional(),
    })
    .default({}),
  featured: z.boolean().default(false),
});
export type ArtistInput = z.infer<typeof artistInputSchema>;
