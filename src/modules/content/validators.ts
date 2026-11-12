import { z } from "zod";
import { httpsUrlSchema, slugSchema, uuidSchema } from "@/lib/validation";
import { coverArtSchema } from "@/modules/media/cover-art";
import { ARTICLE_LAYOUTS, ARTICLE_STATES } from "./schema";

const seoSchema = z
  .object({
    title: z.string().max(70).optional(),
    description: z.string().max(170).optional(),
    canonical: z.url().optional(),
    noindex: z.boolean().optional(),
    ogImage: z.url().optional(),
  })
  .default({});

export const referenceSchema = z.object({
  title: z.string().trim().min(2).max(200),
  url: httpsUrlSchema,
  outlet: z.string().trim().max(120).optional(),
});
export type ReferenceInput = z.infer<typeof referenceSchema>;

const tagName = z.string().trim().min(2).max(30);

const base = {
  title: z.string().trim().min(3).max(180),
  slug: slugSchema.optional(),
  locale: z.enum(["es", "en"]).default("es"),
  kicker: z.string().trim().max(40).optional(),
  dek: z.string().trim().max(400).optional(),
  bodyJson: z.unknown().optional(),
  bodyHtml: z.string().max(400_000).optional(),
  categoryId: uuidSchema.optional(),
  status: z.enum(ARTICLE_STATES).default("draft"),
  scheduledFor: z.coerce.date().optional(),
  layout: z.enum(ARTICLE_LAYOUTS).default("standard"),
  coverArt: coverArtSchema.optional(),
  coverUrl: httpsUrlSchema.optional(),
  coverAlt: z.string().trim().max(200).optional(),
  coverCredit: z.string().trim().max(200).optional(),
  seo: seoSchema,
  authorName: z.string().trim().max(120).optional(),
  tags: z.array(tagName).max(8).default([]),
  /** Artistas o bandas de los que trata la nota: alimentan su perfil público. */
  artistIds: z.array(uuidSchema).max(20).default([]),
  references: z.array(referenceSchema).max(12).default([]),
};

/** Reglas entre estado y fecha de programación. */
function statusRules(v: { status: string; scheduledFor?: Date }, ctx: z.RefinementCtx) {
  if (v.status === "scheduled") {
    if (!v.scheduledFor)
      ctx.addIssue({ code: "custom", path: ["scheduledFor"], message: "Indica la fecha de publicación" });
    else if (v.scheduledFor.getTime() <= Date.now())
      ctx.addIssue({ code: "custom", path: ["scheduledFor"], message: "La fecha programada debe ser futura" });
  }
  if (v.status !== "scheduled" && v.scheduledFor)
    ctx.addIssue({ code: "custom", path: ["scheduledFor"], message: "Solo los artículos programados llevan fecha" });
}

export const articleInputSchema = z.object(base).superRefine(statusRules);
export type ArticleInput = z.infer<typeof articleInputSchema>;

/**
 * Actualización desde el editor (incluye guardado automático). `expectedUpdatedAt` evita pisar cambios de
 * otra persona: si la fecha no coincide, el servidor responde con un conflicto.
 */
export const articleUpdateSchema = z
  .object({ ...base, expectedUpdatedAt: z.coerce.date().optional() })
  .superRefine(statusRules);
export type ArticleUpdate = z.infer<typeof articleUpdateSchema>;

export const listArticlesQuerySchema = z.object({
  category: slugSchema.optional(),
  q: z.string().trim().min(2).max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;

export const adminListQuerySchema = z.object({
  status: z.enum(ARTICLE_STATES).optional(),
  q: z.string().trim().min(2).max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
