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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pk, timestamps } from "@/lib/db/columns";
import { users } from "@/modules/users/schema";
import { media } from "@/modules/media/schema";
import { categories, tags } from "@/modules/taxonomy/schema";
import type { CoverArt } from "@/modules/media/cover-art";

export const ARTICLE_STATES = ["draft", "review", "scheduled", "published", "archived"] as const;
export type ArticleState = (typeof ARTICLE_STATES)[number];
export const articleStateEnum = pgEnum("article_state", ARTICLE_STATES);

export const ARTICLE_LAYOUTS = ["standard", "special"] as const;
export const articleLayoutEnum = pgEnum("article_layout", ARTICLE_LAYOUTS);

export const ARTICLE_ORIGINS = ["manual", "imported"] as const;
export const articleOriginEnum = pgEnum("article_origin", ARTICLE_ORIGINS);

export type SeoMeta = { title?: string; description?: string; canonical?: string; noindex?: boolean; ogImage?: string };

export const articles = pgTable(
  "articles",
  {
    id: pk(),
    slug: text("slug").notNull(),
    locale: text("locale").notNull().default("es"),
    title: text("title").notNull(),
    /** Etiqueta editorial corta sobre el titular (p. ej. «Reportaje»). */
    kicker: text("kicker"),
    dek: text("dek"),
    /** Documento Tiptap (fuente de verdad) y su HTML saneado (lo que se renderiza). */
    bodyJson: jsonb("body_json"),
    bodyHtml: text("body_html"),
    coverId: uuid("cover_id").references(() => media.id, { onDelete: "set null" }),
    coverArt: jsonb("cover_art").$type<CoverArt>(),
    /** Portada fotográfica por URL https (hasta que exista la subida de medios). Tiene prioridad sobre coverArt. */
    coverUrl: text("cover_url"),
    coverAlt: text("cover_alt"),
    coverCredit: text("cover_credit"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    /** Firma visible cuando el autor no es un usuario del sistema (colaboradores externos, demo). */
    authorName: text("author_name"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    status: articleStateEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    layout: articleLayoutEnum("layout").notNull().default("standard"),
    readMinutes: integer("read_minutes"),
    seo: jsonb("seo").$type<SeoMeta>().notNull().default({}),
    origin: articleOriginEnum("origin").notNull().default("manual"),
    isDemo: boolean("is_demo").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("articles_locale_slug_idx").on(t.locale, t.slug),
    index("articles_feed_idx").on(t.status, t.publishedAt),
    index("articles_category_idx").on(t.categoryId),
    // Búsqueda de texto completo en español (título + bajada).
    index("articles_search_idx").using(
      "gin",
      sql`to_tsvector('spanish', coalesce(${t.title}, '') || ' ' || coalesce(${t.dek}, ''))`,
    ),
  ],
);

export const articleRevisions = pgTable(
  "article_revisions",
  {
    id: pk(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyJson: jsonb("body_json"),
    bodyHtml: text("body_html"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("revisions_article_idx").on(t.articleId, t.createdAt)],
);

export const articleTags = pgTable(
  "article_tags",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.articleId, t.tagId] })],
);

export const ENTITY_KINDS = ["artist", "release", "event"] as const;
export const entityKindEnum = pgEnum("entity_kind", ENTITY_KINDS);

/** Artistas, lanzamientos y eventos mencionados por un artículo (alimenta «noticias relacionadas»). */
export const articleEntities = pgTable(
  "article_entities",
  {
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    kind: entityKindEnum("kind").notNull(),
    entityId: uuid("entity_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.articleId, t.kind, t.entityId] }),
    index("article_entities_ref_idx").on(t.kind, t.entityId),
  ],
);

export const references = pgTable(
  "references",
  {
    id: pk(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    outlet: text("outlet"),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("references_article_idx").on(t.articleId)],
);

export const pages = pgTable(
  "pages",
  {
    id: pk(),
    slug: text("slug").notNull(),
    locale: text("locale").notNull().default("es"),
    title: text("title").notNull(),
    bodyJson: jsonb("body_json"),
    bodyHtml: text("body_html"),
    status: articleStateEnum("status").notNull().default("draft"),
    seo: jsonb("seo").$type<SeoMeta>().notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("pages_locale_slug_idx").on(t.locale, t.slug)],
);

export const HOME_BLOCK_KINDS = ["hero", "feature"] as const;
export type HomeBlockKind = (typeof HOME_BLOCK_KINDS)[number];
export const homeBlockKindEnum = pgEnum("home_block_kind", HOME_BLOCK_KINDS);

/** Configuración de un slide del hero: líneas del titular y datos de presentación. */
export type HeroConfig = {
  lines: string[];
  accentFrom: number;
  /** Frase editorial breve que acompaña el titular completo. */
  phrase?: string;
  place?: string;
  cta?: string;
  meta?: string;
  path?: [string, string, string];
  /** Usa la figura de portada (ilustración) en lugar de la escena generativa de la portada. */
  figure?: boolean;
};

/** Bloques destacados de la portada, administrables (7.5). */
export const homeBlocks = pgTable(
  "home_blocks",
  {
    id: pk(),
    kind: homeBlockKindEnum("kind").notNull(),
    position: integer("position").notNull(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    config: jsonb("config").$type<HeroConfig | Record<string, never>>().notNull().default({}),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("home_blocks_kind_pos_idx").on(t.kind, t.position)],
);
