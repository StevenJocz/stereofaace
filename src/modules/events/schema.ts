import {
  boolean,
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
import { artists } from "@/modules/artists/schema";
import { genres } from "@/modules/taxonomy/schema";
import type { CoverArt } from "@/modules/media/cover-art";

export const EVENT_KINDS = ["festival", "concierto", "rave", "presentacion", "underground", "gira"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const eventKindEnum = pgEnum("event_kind", EVENT_KINDS);

export const EVENT_STATES = ["draft", "published", "cancelled"] as const;
export const eventStateEnum = pgEnum("event_state", EVENT_STATES);

export const events = pgTable(
  "events",
  {
    id: pk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: eventKindEnum("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    venue: text("venue"),
    city: text("city").notNull(),
    /** ISO 3166-1 alfa-2. */
    country: text("country").notNull(),
    description: text("description"),
    genreId: uuid("genre_id").references(() => genres.id, { onDelete: "set null" }),
    /** Enlace oficial de entradas: siempre del organizador, nunca vendemos entradas. */
    ticketUrl: text("ticket_url"),
    coverArt: jsonb("cover_art").$type<CoverArt>(),
    status: eventStateEnum("status").notNull().default("draft"),
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("events_when_idx").on(t.status, t.startsAt), index("events_place_idx").on(t.country, t.city)],
);

export const eventArtists = pgTable(
  "event_artists",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.artistId] })],
);
