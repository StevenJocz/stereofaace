import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { uniqueSlug } from "@/lib/admin/slug";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/slug";
import { slugSchema } from "@/lib/validation";
import { recordAudit } from "@/modules/users/audit";
import { pages } from "./schema";

export const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: slugSchema.optional(),
  bodyJson: z.unknown().optional(),
  bodyHtml: z.string().max(200_000).default(""),
  seo: z
    .object({ title: z.string().trim().max(70).optional(), description: z.string().trim().max(200).optional() })
    .default({}),
});

const LOCALE = "es";

async function slugTaken(db: Db, slug: string, exceptId?: string): Promise<boolean> {
  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.locale, LOCALE), eq(pages.slug, slug)));
  return rows.some((r) => r.id !== exceptId);
}

export async function listPagesAdmin(db: Db, actor: Actor | null) {
  assertCan(actor, "page:read");
  return db
    .select({ id: pages.id, slug: pages.slug, title: pages.title, status: pages.status, updatedAt: pages.updatedAt })
    .from(pages)
    .orderBy(asc(pages.title));
}

export async function getPageAdmin(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "page:read");
  const [row] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  return row ?? null;
}

export async function createPage(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string; slug: string }> {
  assertCan(actor, "page:create");
  const input = pageInputSchema.parse(raw);
  if (input.slug && (await slugTaken(db, input.slug)))
    throw new DomainError("slug_taken", "Ya existe una página con ese identificador.");
  const slug = input.slug ?? (await uniqueSlug(db, pages, slugify(input.title), "pagina"));
  const [row] = await db
    .insert(pages)
    .values({
      slug,
      locale: LOCALE,
      title: input.title,
      bodyJson: input.bodyJson ?? null,
      bodyHtml: sanitizeArticleHtml(input.bodyHtml),
      seo: input.seo,
    })
    .returning({ id: pages.id, slug: pages.slug });
  await recordAudit(db, { userId: actor.id, action: "page.create", entity: "page", entityId: row.id });
  return row;
}

export async function updatePage(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
  assertCan(actor, "page:update");
  const input = pageInputSchema.parse(raw);
  const current = await getPageAdmin(db, actor, id);
  if (!current) throw new DomainError("not_found", "Página no encontrada");
  if (input.slug && input.slug !== current.slug && (await slugTaken(db, input.slug, id)))
    throw new DomainError("slug_taken", "Ya existe una página con ese identificador.");
  await db
    .update(pages)
    .set({
      title: input.title,
      slug: input.slug ?? current.slug,
      bodyJson: input.bodyJson ?? null,
      bodyHtml: sanitizeArticleHtml(input.bodyHtml),
      seo: input.seo,
    })
    .where(eq(pages.id, id));
  await recordAudit(db, { userId: actor.id, action: "page.update", entity: "page", entityId: id });
}

export async function setPageStatus(db: Db, actor: Actor | null, id: string, status: "draft" | "published"): Promise<void> {
  assertCan(actor, "page:publish");
  const done = await db.update(pages).set({ status }).where(eq(pages.id, id)).returning({ id: pages.id });
  if (done.length === 0) throw new DomainError("not_found", "Página no encontrada");
  await recordAudit(db, { userId: actor.id, action: "page.status", entity: "page", entityId: id, diff: { status } });
}

export async function deletePage(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "page:delete");
  const done = await db.delete(pages).where(eq(pages.id, id)).returning({ id: pages.id });
  if (done.length === 0) throw new DomainError("not_found", "Página no encontrada");
  await recordAudit(db, { userId: actor.id, action: "page.delete", entity: "page", entityId: id });
}

/** Lectura pública: solo páginas publicadas. */
export async function getPublishedPage(db: Db, slug: string) {
  const [row] = await db
    .select({ title: pages.title, bodyHtml: pages.bodyHtml, seo: pages.seo, updatedAt: pages.updatedAt })
    .from(pages)
    .where(and(eq(pages.locale, LOCALE), eq(pages.slug, slug), eq(pages.status, "published")))
    .limit(1);
  return row ?? null;
}

/** Páginas publicadas para el sitemap. */
export async function listPublishedPageSlugs(db: Db) {
  return db
    .select({ slug: pages.slug, updatedAt: pages.updatedAt })
    .from(pages)
    .where(and(eq(pages.locale, LOCALE), eq(pages.status, "published")));
}
