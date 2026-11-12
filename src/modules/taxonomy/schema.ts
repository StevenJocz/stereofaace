import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { pk, timestamps } from "@/lib/db/columns";

export const categories = pgTable("categories", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Color de acento opcional para chips y etiquetas. */
  color: text("color"),
  position: integer("position").notNull().default(0),
  ...timestamps,
});

export const tags = pgTable("tags", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

export const genres = pgTable("genres", {
  id: pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  /** Familia amplia: electronica | indie | otros. */
  family: text("family").notNull().default("otros"),
  ...timestamps,
});
