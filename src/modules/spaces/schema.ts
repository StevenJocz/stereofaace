import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk } from "@/lib/db/columns";
import { artists } from "@/modules/artists/schema";
import { users } from "@/modules/users/schema";
import type { SpaceDesign } from "./design";

export const PROFILE_STATUS = ["draft", "published", "disabled"] as const;
export type ProfileStatus = (typeof PROFILE_STATUS)[number];

export type SpacePrivacy = {
  /** Aparece en /spaces y en las búsquedas. */
  listed: boolean;
  showLocation: boolean;
  showJoined: boolean;
  showLinks: boolean;
  showFavorites: boolean;
  /** Mostrar cuántas personas la siguen y a cuántas sigue. */
  showFollows: boolean;
};
export const DEFAULT_PRIVACY: SpacePrivacy = { listed: true, showLocation: true, showJoined: true, showLinks: true, showFavorites: true, showFollows: true };
export type SpaceLinks = Partial<Record<"instagram" | "x" | "tiktok" | "facebook" | "youtube" | "spotify" | "soundcloud" | "bandcamp" | "web", string>>;

/** Perfil público de una persona (StereoFace Spaces). Una fila por usuario; el diseño se guarda como JSON validado, nunca como HTML ni CSS. */
export const spaceProfiles = pgTable(
  "space_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Nombre de usuario en minúsculas (único). La dirección pública es /@usuario. */
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    location: text("location"),
    tagline: text("tagline"),
    links: jsonb("links").$type<SpaceLinks>().notNull().default({}),
    privacy: jsonb("privacy").$type<SpacePrivacy>().notNull().default(DEFAULT_PRIVACY),
    status: text("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    /** Chulo de verificado: lo da el equipo (cualquier rol por encima de oyente). `null` = sin chulo. */
    badgeVerifiedAt: timestamp("badge_verified_at", { withTimezone: true }),
    badgeVerifiedBy: uuid("badge_verified_by").references(() => users.id, { onDelete: "set null" }),
    avatarAssetId: uuid("avatar_asset_id"),
    coverAssetId: uuid("cover_asset_id"),
    /** Lo que se edita (autoguardado) y lo que ven los visitantes. */
    draftDesign: jsonb("draft_design").$type<SpaceDesign>(),
    publishedDesign: jsonb("published_design").$type<SpaceDesign>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex("space_profiles_username_idx").on(sql`lower(${t.username})`), index("space_profiles_status_idx").on(t.status, t.publishedAt), index("space_profiles_featured_idx").on(t.featured)],
);

/** Géneros que una persona puede elegir (los gestiona el administrador). */
export const spaceGenreOptions = pgTable("space_genre_options", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
});

export const spaceProfileGenres = pgTable(
  "space_profile_genres",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    genreId: uuid("genre_id")
      .notNull()
      .references(() => spaceGenreOptions.id, { onDelete: "cascade" }),
    /** Orden de preferencia: 0 = el favorito. */
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.genreId] })],
);

/** Artistas favoritos: del catálogo de StereoFace (`artistId`) o escritos a mano (`name`) mientras el catálogo crece. */
export const spaceFavoriteArtists = pgTable(
  "space_favorite_artists",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id").references(() => artists.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("space_fav_artists_user_idx").on(t.userId, t.position)],
);

/** Plantillas visuales (las gestiona el administrador). El diseño es JSON validado. */
export const spaceThemes = pgTable("space_themes", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  design: jsonb("design").$type<SpaceDesign>().notNull(),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
});

export const ASSET_KINDS = ["avatar", "cover", "background", "gallery"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Imágenes subidas por las personas. El archivo vive en el almacenamiento local bajo `storageKey` (uuid). */
export const spaceAssets = pgTable(
  "space_assets",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    /** Texto alternativo opcional (galería). */
    alt: text("alt"),
    position: integer("position").notNull().default(0),
    /** «flagged»: la administración la marcó y deja de mostrarse. */
    status: text("status").notNull().default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("space_assets_user_idx").on(t.userId, t.kind)],
);

export const REPORT_REASONS = ["spam", "ofensivo", "suplantacion", "derechos", "otro"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const spaceReports = pgTable(
  "space_reports",
  {
    id: pk(),
    profileUserId: uuid("profile_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    detail: text("detail"),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("space_reports_status_idx").on(t.status, t.createdAt)],
);

/** Enlaces de un solo uso para verificar el correo y restablecer la contraseña. Solo se guarda el hash. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId, t.kind)],
);

/** Quién sigue a quién. Una persona no se sigue a sí misma; las dos puntas son cuentas con Space. */
export const spaceFollows = pgTable(
  "space_follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedId: uuid("followed_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followedId] }), index("space_follows_followed_idx").on(t.followedId), check("space_follows_not_self", sql`${t.followerId} <> ${t.followedId}`)],
);
