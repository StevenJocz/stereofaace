import { z } from "zod";
import { countrySchema, httpsUrlSchema, slugSchema } from "@/lib/validation";
import { coverArtSchema } from "@/modules/media/cover-art";
import { EVENT_KINDS } from "./schema";

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    slug: slugSchema.optional(),
    kind: z.enum(EVENT_KINDS),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    venue: z.string().trim().max(160).optional(),
    city: z.string().trim().min(1).max(100),
    country: countrySchema,
    description: z.string().trim().max(8000).optional(),
    genreId: z.uuid().optional(),
    artistIds: z.array(z.uuid()).max(60).default([]),
    ticketUrl: httpsUrlSchema.optional(),
    coverArt: coverArtSchema.optional(),
    status: z.enum(["draft", "published", "cancelled"]).default("draft"),
  })
  .refine((v) => !v.endsAt || v.endsAt >= v.startsAt, {
    path: ["endsAt"],
    message: "El fin no puede ser anterior al inicio",
  });
export type EventInput = z.infer<typeof eventInputSchema>;

export const listEventsQuerySchema = z.object({
  country: countrySchema.optional(),
  city: z.string().trim().max(100).optional(),
  genre: slugSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
