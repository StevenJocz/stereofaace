import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { users } from "@/modules/users/schema";

/** Tipos de cart (todo lo que suena en el estudio y no es música). */
export const CART_KINDS = ["jingle", "promo", "sweeper", "effect", "ad", "id"] as const;
export type CartKind = (typeof CART_KINDS)[number];

/** Cart Wall del estudio: audio corto que el DJ dispara al instante (jingles, promos, cortinillas, efectos…). */
export const studioCarts = pgTable(
  "studio_carts",
  {
    id: pk(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    color: text("color").notNull().default("#c6ff00"),
    hotkey: text("hotkey"),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    durationSec: real("duration_sec"),
    gainDb: real("gain_db").notNull().default(0),
    duck: boolean("duck").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("studio_carts_position_idx").on(t.position)],
);

export type SavedItem = { azId: string; title: string; artist: string; durationSec: number | null };

/** Listas de reproducción guardadas por cada DJ (solo pistas de la biblioteca de AzuraCast). */
export const studioPlaylists = pgTable(
  "studio_playlists",
  {
    id: pk(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    items: jsonb("items").$type<SavedItem[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [index("studio_playlists_owner_idx").on(t.ownerId)],
);

/** Historial de lo que sonó al aire durante las emisiones en vivo. */
export const studioHistory = pgTable(
  "studio_history",
  {
    id: pk(),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    source: text("source").notNull(),
    djName: text("dj_name"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("studio_history_played_idx").on(t.playedAt)],
);

/** Cómo entra un evento del programador: `delayed` espera a que termine la pista que suena; `fixed` entra a su hora exacta. */
export const EVENT_MODES = ["delayed", "fixed"] as const;
export type EventMode = (typeof EVENT_MODES)[number];
/** Transición de un evento `fixed` con algo sonando: fundido o corte en seco. */
export const EVENT_TRANSITIONS = ["fade", "cut"] as const;
export type EventTransition = (typeof EVENT_TRANSITIONS)[number];

/** Qué suena en un evento: un cart (jingle, promo…) del Cart Wall o una pista de la biblioteca de AzuraCast. */
export type EventItem =
  | { kind: "cart"; cartId: string; name: string; durationSec: number | null }
  | { kind: "file"; azId: string; title: string; artist: string; durationSec: number | null };

/**
 * Programador del estudio (como los «eventos» de ZaraStudio): a una hora y en ciertos días entra un bloque de audios.
 * Los ejecuta la consola del estudio mientras se emite en vivo; aquí solo se guardan, compartidos por toda la emisora.
 */
export const studioEvents = pgTable(
  "studio_events",
  {
    id: pk(),
    name: text("name").notNull(),
    /** Hora del evento: minutos desde la medianoche, hora de Bogotá (0–1439). */
    minuteOfDay: integer("minute_of_day").notNull(),
    /** Días en que corre, ISO: 1 lunes … 7 domingo. */
    days: jsonb("days").$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6, 7]),
    mode: text("mode").notNull().default("delayed"),
    transition: text("transition").notNull().default("fade"),
    active: boolean("active").notNull().default(true),
    items: jsonb("items").$type<EventItem[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("studio_events_minute_idx").on(t.minuteOfDay)],
);
