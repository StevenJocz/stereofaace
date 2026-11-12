import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { media } from "@/modules/media/schema";
import { genres } from "@/modules/taxonomy/schema";
import type { CoverArt } from "@/modules/media/cover-art";

export type ArtistLinks = Partial<
  Record<"spotify" | "soundcloud" | "bandcamp" | "youtube" | "instagram" | "x" | "facebook" | "tiktok" | "web", string>
>;

export const artists = pgTable(
  "artists",
  {
    id: pk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    bio: text("bio"),
    /** ISO 3166-1 alfa-2. */
    country: text("country"),
    photoId: uuid("photo_id").references(() => media.id, { onDelete: "set null" }),
    coverArt: jsonb("cover_art").$type<CoverArt>(),
    links: jsonb("links").$type<ArtistLinks>().notNull().default({}),
    featured: boolean("featured").notNull().default(false),
    /** Contenido de demostración: ficticio, identificado como tal en la interfaz. */
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("artists_featured_idx").on(t.featured)],
);

export const artistGenres = pgTable(
  "artist_genres",
  {
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    genreId: uuid("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.artistId, t.genreId] })],
);
