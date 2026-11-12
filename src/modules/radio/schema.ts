import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk, timestamps } from "@/lib/db/columns";
import { genres } from "@/modules/taxonomy/schema";
import { users } from "@/modules/users/schema";

/**
 * StereoFace Frequencies: emisoras que el NAVEGADOR de la persona reproduce directamente desde su
 * origen. Nuestro servidor solo guarda metadatos y el enlace; nunca descarga, almacena ni retransmite
 * la señal de terceros.
 *   hls     → lista .m3u8 (hls.js o reproducción nativa)
 *   direct  → flujo de audio directo (Icecast/Shoutcast: MP3, AAC)
 *   embed   → reproductor oficial incrustado por el propio proveedor
 */
export const STREAM_KINDS = ["hls", "direct", "embed"] as const;
export type StreamKind = (typeof STREAM_KINDS)[number];
export const streamKindEnum = pgEnum("stream_kind", STREAM_KINDS);

/** Estado de la autorización para retransmitir/enlazar la señal. */
export const AUTHORIZATION_STATES = ["pending", "granted", "denied", "not_required"] as const;
export type AuthorizationState = (typeof AUTHORIZATION_STATES)[number];
export const authorizationEnum = pgEnum("radio_authorization", AUTHORIZATION_STATES);

export const radioStations = pgTable(
  "radio_stations",
  {
    id: pk(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    /** ISO 3166-1 alfa-2. */
    country: text("country"),
    streamKind: streamKindEnum("stream_kind").notNull().default("hls"),
    streamUrl: text("stream_url"),
    embedUrl: text("embed_url"),
    /** El origen envía cabeceras CORS: permite leer los datos de audio para el visualizador. */
    corsEnabled: boolean("cors_enabled").notNull().default(false),
    imageUrl: text("image_url"),
    websiteUrl: text("website_url"),
    /** Atribución obligatoria: se muestra siempre junto al reproductor. */
    attributionName: text("attribution_name").notNull(),
    attributionUrl: text("attribution_url").notNull(),
    attributionNote: text("attribution_note"),
    authorizationStatus: authorizationEnum("authorization_status").notNull().default("pending"),
    /** Evidencia: quién autorizó, cuándo y por qué medio (correo, contrato, licencia, etc.). */
    authorizationNotes: text("authorization_notes"),
    authorizationVerifiedAt: timestamp("authorization_verified_at", { withTimezone: true }),
    authorizationVerifiedBy: uuid("authorization_verified_by").references(() => users.id, { onDelete: "set null" }),
    /** Nace desactivada. Solo puede activarse con autorización concedida (o no requerida) y una fuente configurada. */
    enabled: boolean("enabled").notNull().default(false),
    position: integer("position").notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("radio_stations_enabled_idx").on(t.enabled, t.position),
    // Defensa en profundidad: aunque falle la validación de la aplicación, la base rechaza activar sin permiso.
    check(
      "radio_enabled_requires_authorization",
      sql`NOT ${t.enabled} OR ${t.authorizationStatus} IN ('granted', 'not_required')`,
    ),
    check(
      "radio_enabled_requires_source",
      sql`NOT ${t.enabled} OR (${t.streamKind} = 'embed' AND ${t.embedUrl} IS NOT NULL) OR (${t.streamKind} <> 'embed' AND ${t.streamUrl} IS NOT NULL)`,
    ),
  ],
);

export const radioStationGenres = pgTable(
  "radio_station_genres",
  {
    stationId: uuid("station_id")
      .notNull()
      .references(() => radioStations.id, { onDelete: "cascade" }),
    genreId: uuid("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.stationId, t.genreId] })],
);
