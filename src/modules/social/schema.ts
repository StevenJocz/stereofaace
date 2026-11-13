import { index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";
import { articles } from "@/modules/content/schema";

/** Publicaciones de artículos en redes sociales (una por artículo y red): evita duplicados y guarda el resultado. */
export const socialPosts = pgTable(
  "social_posts",
  {
    id: pk(),
    articleId: uuid("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    network: text("network").notNull(),
    /** posted = publicada; failed = falló (se puede reintentar). */
    status: text("status").notNull(),
    externalId: text("external_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [unique("social_posts_article_network_unique").on(t.articleId, t.network), index("social_posts_status_idx").on(t.status)],
);
