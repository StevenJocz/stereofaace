import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { categories } from "@/modules/taxonomy/schema";
import { articles } from "@/modules/content/schema";

export const SOURCE_KINDS = ["rss", "atom", "api", "ical", "manual"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];
export const sourceKindEnum = pgEnum("source_kind", SOURCE_KINDS);

/**
 * Política de derechos de la fuente (invariante del motor de noticias):
 *  - metadata_only: solo título, extracto autorizado, enlace y atribución; ficha breve original.
 *  - licensed / express_permission: permiten artículo desarrollado.
 */
export const RIGHTS_POLICIES = ["metadata_only", "licensed", "express_permission"] as const;
export type RightsPolicy = (typeof RIGHTS_POLICIES)[number];
export const rightsPolicyEnum = pgEnum("rights_policy", RIGHTS_POLICIES);

export const PUBLISH_POLICIES = ["always_review", "autopublish"] as const;
export type PublishPolicy = (typeof PUBLISH_POLICIES)[number];
export const publishPolicyEnum = pgEnum("publish_policy", PUBLISH_POLICIES);

export const sources = pgTable("sources", {
  id: pk(),
  name: text("name").notNull(),
  kind: sourceKindEnum("kind").notNull(),
  url: text("url").notNull(),
  intervalMinutes: integer("interval_minutes").notNull().default(60),
  defaultCategoryId: uuid("default_category_id").references(() => categories.id, { onDelete: "set null" }),
  rightsPolicy: rightsPolicyEnum("rights_policy").notNull().default("metadata_only"),
  publishPolicy: publishPolicyEnum("publish_policy").notNull().default("always_review"),
  /** Las fuentes nacen desactivadas: se activan solo tras verificar términos y licencia. */
  active: boolean("active").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  dailyLimit: integer("daily_limit").notNull().default(20),
  termsVerifiedAt: timestamp("terms_verified_at", { withTimezone: true }),
  legalNotes: text("legal_notes"),
  rules: jsonb("rules").notNull().default({}),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  ...timestamps,
});

export const RUN_STATES = ["running", "ok", "error"] as const;
export const runStateEnum = pgEnum("run_state", RUN_STATES);

export const sourceRuns = pgTable(
  "source_runs",
  {
    id: pk(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: runStateEnum("status").notNull().default("running"),
    newItems: integer("new_items").notNull().default(0),
    duplicates: integer("duplicates").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    log: jsonb("log"),
  },
  (t) => [index("source_runs_source_idx").on(t.sourceId, t.startedAt)],
);

export const ITEM_STATES = [
  "discovered",
  "processing",
  "pending_review",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "error",
] as const;
export type ItemState = (typeof ITEM_STATES)[number];
export const itemStateEnum = pgEnum("item_state", ITEM_STATES);

export const sourceItems = pgTable(
  "source_items",
  {
    id: pk(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    /** Identificador estable del ítem en la fuente; junto con sourceId garantiza idempotencia. */
    guid: text("guid").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    /** Solo el extracto que la fuente autoriza a mostrar. */
    summary: text("summary"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    contentHash: text("content_hash"),
    language: text("language"),
    genre: text("genre"),
    categorySlug: text("category_slug"),
    relevance: real("relevance"),
    status: itemStateEnum("status").notNull().default("discovered"),
    articleId: uuid("article_id").references(() => articles.id, { onDelete: "set null" }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("source_items_guid_idx").on(t.sourceId, t.guid),
    index("source_items_status_idx").on(t.status),
    index("source_items_hash_idx").on(t.contentHash),
  ],
);

/** Consumo de IA para aplicar topes diarios de costo. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: pk(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    task: text("task").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);
