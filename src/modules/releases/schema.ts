import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { media } from "@/modules/media/schema";
import { artists } from "@/modules/artists/schema";
import type { CoverArt } from "@/modules/media/cover-art";

export const RELEASE_KINDS = ["album", "ep", "single", "remix", "video", "set", "podcast"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];
export const releaseKindEnum = pgEnum("release_kind", RELEASE_KINDS);

export const PUBLISH_STATES = ["draft", "published"] as const;
export const publishStateEnum = pgEnum("publish_state", PUBLISH_STATES);

export const releases = pgTable(
  "releases",
  {
    id: pk(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    kind: releaseKindEnum("kind").notNull(),
    releasedAt: date("released_at", { mode: "date" }).notNull(),
    label: text("label"),
    coverId: uuid("cover_id").references(() => media.id, { onDelete: "set null" }),
    coverArt: jsonb("cover_art").$type<CoverArt>(),
    /** URL de reproductor oficial de un proveedor permitido (ver validators). Nunca se aloja audio propio. */
    embedUrl: text("embed_url"),
    status: publishStateEnum("status").notNull().default("draft"),
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("releases_date_idx").on(t.status, t.releasedAt)],
);

export const releaseArtists = pgTable(
  "release_artists",
  {
    releaseId: uuid("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.releaseId, t.artistId] })],
);
