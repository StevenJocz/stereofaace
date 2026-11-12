import { asc } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, genres } from "./schema";

export async function listGenres(db: Db) {
  return db
    .select({ id: genres.id, slug: genres.slug, name: genres.name, family: genres.family })
    .from(genres)
    .orderBy(asc(genres.name));
}

export async function listCategories(db: Db) {
  return db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.position));
}
