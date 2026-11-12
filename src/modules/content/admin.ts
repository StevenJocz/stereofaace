import { and, count, desc, eq, ilike, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, canEditArticle, canSetArticleStatus, ForbiddenError, type Actor } from "@/lib/rbac";
import { readingMinutes, sanitizeArticleHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/slug";
import { artists } from "@/modules/artists/schema";
import { categories, tags } from "@/modules/taxonomy/schema";
import { users } from "@/modules/users/schema";
import { recordAudit } from "@/modules/users/audit";
import { articleEntities, articleRevisions, articleTags, articles, homeBlocks, references, type ArticleState } from "./schema";
import {
  adminListQuerySchema,
  articleInputSchema,
  articleUpdateSchema,
  type AdminListQuery,
  type ReferenceInput,
} from "./validators";

const MAX_REVISIONS = 50;

/* ───────────── utilidades ───────────── */

async function uniqueSlug(db: Db, base: string, locale: string, exceptId?: string): Promise<string> {
  const root = base || "articulo";
  const candidates = [root, ...Array.from({ length: 20 }, (_, i) => `${root}-${i + 2}`)];
  const taken = await db
    .select({ id: articles.id, slug: articles.slug })
    .from(articles)
    .where(and(eq(articles.locale, locale), inArray(articles.slug, candidates)));
  const used = new Set(taken.filter((t) => t.id !== exceptId).map((t) => t.slug));
  const free = candidates.find((c) => !used.has(c));
  return free ?? `${root}-${Date.now().toString(36)}`;
}

function prepareBody(bodyHtml?: string) {
  if (bodyHtml === undefined) return { bodyHtml: undefined, readMinutes: undefined };
  const clean = sanitizeArticleHtml(bodyHtml);
  return { bodyHtml: clean, readMinutes: clean ? readingMinutes(clean) : null };
}

/** Reemplaza los artistas etiquetados en un artículo. Los ids deben existir y no estar borrados. */
async function syncArtists(db: Db, articleId: string, artistIds: string[]) {
  const unique = [...new Set(artistIds)];
  if (unique.length) {
    const found = await db
      .select({ id: artists.id })
      .from(artists)
      .where(and(inArray(artists.id, unique), isNull(artists.deletedAt)));
    if (found.length !== unique.length) throw new DomainError("bad_artist", "Alguno de los artistas elegidos ya no existe.");
  }
  await db.delete(articleEntities).where(and(eq(articleEntities.articleId, articleId), eq(articleEntities.kind, "artist")));
  if (unique.length)
    await db.insert(articleEntities).values(unique.map((entityId) => ({ articleId, kind: "artist" as const, entityId })));
}

async function syncTags(db: Db, articleId: string, names: string[]) {
  // Una etiqueta por slug; se conserva la primera grafía escrita.
  const seen = new Map<string, string>();
  for (const n of names) if (slugify(n) && !seen.has(slugify(n))) seen.set(slugify(n), n);
  const unique = Array.from(seen.entries());
  await db.delete(articleTags).where(eq(articleTags.articleId, articleId));
  if (unique.length === 0) return;
  await db
    .insert(tags)
    .values(unique.map(([slug, name]) => ({ slug, name })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: tags.id })
    .from(tags)
    .where(
      inArray(
        tags.slug,
        unique.map(([slug]) => slug),
      ),
    );
  await db.insert(articleTags).values(rows.map((r) => ({ articleId, tagId: r.id })));
}

async function syncReferences(db: Db, articleId: string, refs: ReferenceInput[]) {
  await db.delete(references).where(eq(references.articleId, articleId));
  if (refs.length)
    await db
      .insert(references)
      .values(refs.map((r, position) => ({ articleId, title: r.title, url: r.url, outlet: r.outlet, position })));
}

async function addRevision(
  db: Db,
  articleId: string,
  title: string,
  bodyJson: unknown,
  bodyHtml: string | null | undefined,
  authorId: string,
) {
  await db.insert(articleRevisions).values({ articleId, title, bodyJson, bodyHtml: bodyHtml ?? null, authorId });
  // Conserva solo las últimas MAX_REVISIONS.
  const keep = await db
    .select({ id: articleRevisions.id })
    .from(articleRevisions)
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.createdAt))
    .limit(MAX_REVISIONS);
  if (keep.length === MAX_REVISIONS)
    await db.delete(articleRevisions).where(
      and(
        eq(articleRevisions.articleId, articleId),
        notInArray(
          articleRevisions.id,
          keep.map((k) => k.id),
        ),
      ),
    );
}

async function loadRow(db: Db, id: string) {
  const [row] = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
    .limit(1);
  return row ?? null;
}

/* ───────────── lectura de administración ───────────── */

export async function listArticlesAdmin(db: Db, actor: Actor | null, rawQuery: Partial<AdminListQuery> = {}) {
  assertCan(actor, "article:read");
  const q = adminListQuerySchema.parse(rawQuery);
  const where = and(
    isNull(articles.deletedAt),
    q.status ? eq(articles.status, q.status) : undefined,
    q.q ? ilike(articles.title, `%${q.q.replace(/[\\%_]/g, (c) => "\\" + c)}%`) : undefined,
  );
  const [rows, total] = await Promise.all([
    db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        kicker: articles.kicker,
        updatedAt: articles.updatedAt,
        publishedAt: articles.publishedAt,
        scheduledFor: articles.scheduledFor,
        authorName: sql<string | null>`coalesce(${articles.authorName}, ${users.name})`,
        categoryName: categories.name,
        isDemo: articles.isDemo,
      })
      .from(articles)
      .leftJoin(users, eq(users.id, articles.authorId))
      .leftJoin(categories, eq(categories.id, articles.categoryId))
      .where(where)
      .orderBy(desc(articles.updatedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(articles).where(where),
  ]);
  return { items: rows, total: total[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
}

export async function getArticleAdmin(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "article:read");
  const row = await loadRow(db, id);
  if (!row) return null;
  const [tagRows, refRows, artistRows] = await Promise.all([
    db
      .select({ name: tags.name })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(eq(articleTags.articleId, id)),
    db.select().from(references).where(eq(references.articleId, id)).orderBy(references.position),
    db
      .select({ id: articleEntities.entityId })
      .from(articleEntities)
      .where(and(eq(articleEntities.articleId, id), eq(articleEntities.kind, "artist"))),
  ]);
  return {
    ...row,
    artistIds: artistRows.map((a) => a.id),
    tags: tagRows.map((t) => t.name),
    references: refRows.map((r) => ({ title: r.title, url: r.url, outlet: r.outlet ?? undefined })),
    canEdit: canEditArticle(actor, { authorId: row.authorId, status: row.status }),
  };
}

export async function listRevisions(db: Db, actor: Actor | null, articleId: string) {
  assertCan(actor, "article:read");
  return db
    .select({
      id: articleRevisions.id,
      title: articleRevisions.title,
      createdAt: articleRevisions.createdAt,
      authorName: users.name,
    })
    .from(articleRevisions)
    .leftJoin(users, eq(users.id, articleRevisions.authorId))
    .where(eq(articleRevisions.articleId, articleId))
    .orderBy(desc(articleRevisions.createdAt))
    .limit(MAX_REVISIONS);
}

/* ───────────── escritura (permisos verificados aquí) ───────────── */

/**
 * Crea un artículo. Redactores y colaboradores solo pueden dejarlo en borrador o enviarlo a revisión;
 * publicar o programar exige permiso de publicación.
 */
export async function createArticle(db: Db, actor: Actor | null, raw: unknown) {
  assertCan(actor, "article:create");
  const input = articleInputSchema.parse(raw);
  if (!canSetArticleStatus(actor, input.status)) throw new ForbiddenError(`article:publish (estado ${input.status})`);

  const slug = await uniqueSlug(db, input.slug ?? slugify(input.title), input.locale);
  const body = prepareBody(input.bodyHtml);
  const now = new Date();
  const [created] = await db
    .insert(articles)
    .values({
      slug,
      locale: input.locale,
      title: input.title,
      kicker: input.kicker,
      dek: input.dek,
      bodyJson: input.bodyJson,
      bodyHtml: body.bodyHtml,
      readMinutes: body.readMinutes,
      categoryId: input.categoryId,
      status: input.status,
      scheduledFor: input.scheduledFor,
      publishedAt: input.status === "published" ? now : input.status === "scheduled" ? input.scheduledFor : null,
      layout: input.layout,
      coverArt: input.coverArt,
      coverUrl: input.coverUrl,
      coverAlt: input.coverAlt,
      coverCredit: input.coverCredit,
      seo: input.seo,
      authorId: actor.id,
      authorName: input.authorName,
    })
    .returning({ id: articles.id, slug: articles.slug, status: articles.status });

  await syncTags(db, created.id, input.tags);
  await syncArtists(db, created.id, input.artistIds);
  await syncReferences(db, created.id, input.references);
  await addRevision(db, created.id, input.title, input.bodyJson, body.bodyHtml, actor.id);
  await recordAudit(db, {
    userId: actor.id,
    action: "article.create",
    entity: "article",
    entityId: created.id,
    diff: { status: input.status },
  });
  return created;
}

/**
 * Actualiza un artículo (también el guardado automático). Reglas:
 *  - redactores y colaboradores solo editan sus borradores o revisiones;
 *  - cambiar a publicado, programado o archivado exige permiso de publicación;
 *  - si `expectedUpdatedAt` no coincide, hay un conflicto (otra persona guardó antes);
 *  - el HTML se sanitiza siempre; cada cambio de título o cuerpo guarda una revisión.
 */
export async function updateArticle(db: Db, actor: Actor | null, id: string, raw: unknown) {
  assertCan(actor, "article:update");
  const input = articleUpdateSchema.parse(raw);
  const cur = await loadRow(db, id);
  if (!cur) throw new DomainError("not_found", "Artículo no encontrado");
  if (!canEditArticle(actor, { authorId: cur.authorId, status: cur.status }))
    throw new ForbiddenError("article:update");
  if (input.expectedUpdatedAt && input.expectedUpdatedAt.getTime() !== cur.updatedAt.getTime())
    throw new DomainError(
      "conflict",
      "Alguien más guardó cambios en este artículo. Recarga para ver la versión más reciente.",
    );
  if (input.status !== cur.status && !canSetArticleStatus(actor, input.status))
    throw new ForbiddenError(`article:publish (estado ${input.status})`);

  const body = prepareBody(input.bodyHtml);
  const now = new Date();
  const slug = input.slug && input.slug !== cur.slug ? await uniqueSlug(db, input.slug, input.locale, id) : cur.slug;
  const publishedAt =
    input.status === "published"
      ? ((cur.status === "published" ? cur.publishedAt : null) ?? now)
      : input.status === "scheduled"
        ? input.scheduledFor
        : input.status === "archived"
          ? cur.publishedAt
          : null;

  const [saved] = await db
    .update(articles)
    .set({
      slug,
      locale: input.locale,
      title: input.title,
      kicker: input.kicker ?? null,
      dek: input.dek ?? null,
      ...(input.bodyJson !== undefined ? { bodyJson: input.bodyJson } : {}),
      ...(body.bodyHtml !== undefined ? { bodyHtml: body.bodyHtml, readMinutes: body.readMinutes } : {}),
      categoryId: input.categoryId ?? null,
      status: input.status,
      scheduledFor: input.status === "scheduled" ? input.scheduledFor : null,
      publishedAt,
      layout: input.layout,
      coverArt: input.coverArt ?? null,
      coverUrl: input.coverUrl ?? null,
      coverAlt: input.coverAlt ?? null,
      coverCredit: input.coverCredit ?? null,
      seo: input.seo,
      authorName: input.authorName ?? null,
    })
    .where(eq(articles.id, id))
    .returning({ updatedAt: articles.updatedAt, slug: articles.slug });

  await syncTags(db, id, input.tags);
  await syncArtists(db, id, input.artistIds);
  await syncReferences(db, id, input.references);
  const bodyChanged = body.bodyHtml !== undefined && body.bodyHtml !== (cur.bodyHtml ?? "");
  if (bodyChanged || input.title !== cur.title)
    await addRevision(db, id, input.title, input.bodyJson ?? cur.bodyJson, body.bodyHtml ?? cur.bodyHtml, actor.id);
  await recordAudit(db, {
    userId: actor.id,
    action: "article.update",
    entity: "article",
    entityId: id,
    diff: { from: cur.status, to: input.status, bodyChanged },
  });
  return { updatedAt: saved.updatedAt, slug: saved.slug };
}

/** Cambio de estado puntual (enviar a revisión, publicar, programar, archivar, volver a borrador). */
export async function setArticleStatus(
  db: Db,
  actor: Actor | null,
  id: string,
  status: ArticleState,
  scheduledFor?: Date,
) {
  assertCan(actor, "article:update");
  const cur = await loadRow(db, id);
  if (!cur) throw new DomainError("not_found", "Artículo no encontrado");
  if (!canEditArticle(actor, { authorId: cur.authorId, status: cur.status }))
    throw new ForbiddenError("article:update");
  if (!canSetArticleStatus(actor, status)) throw new ForbiddenError(`article:publish (estado ${status})`);
  if (status === "scheduled" && (!scheduledFor || scheduledFor.getTime() <= Date.now()))
    throw new DomainError("bad_date", "La fecha programada debe ser futura");
  if (status === "published" && !(cur.bodyHtml ?? "").trim())
    throw new DomainError("empty", "No se puede publicar un artículo sin contenido");
  if (status === "published" && !cur.categoryId)
    throw new DomainError("no_category", "Elige una categoría antes de publicar");

  const now = new Date();
  await db
    .update(articles)
    .set({
      status,
      scheduledFor: status === "scheduled" ? scheduledFor : null,
      publishedAt:
        status === "published"
          ? ((cur.status === "published" ? cur.publishedAt : null) ?? now)
          : status === "scheduled"
            ? scheduledFor
            : status === "archived"
              ? cur.publishedAt
              : null,
    })
    .where(eq(articles.id, id));
  await recordAudit(db, {
    userId: actor.id,
    action: "article.status",
    entity: "article",
    entityId: id,
    diff: { from: cur.status, to: status },
  });
}

/** Restaura una revisión (guarda antes el estado actual como revisión nueva para no perderlo). */
export async function restoreRevision(db: Db, actor: Actor | null, articleId: string, revisionId: string) {
  assertCan(actor, "article:update");
  const cur = await loadRow(db, articleId);
  if (!cur) throw new DomainError("not_found", "Artículo no encontrado");
  if (!canEditArticle(actor, { authorId: cur.authorId, status: cur.status }))
    throw new ForbiddenError("article:update");
  const [rev] = await db
    .select()
    .from(articleRevisions)
    .where(and(eq(articleRevisions.id, revisionId), eq(articleRevisions.articleId, articleId)))
    .limit(1);
  if (!rev) throw new DomainError("not_found", "Revisión no encontrada");

  await addRevision(db, articleId, cur.title, cur.bodyJson, cur.bodyHtml, actor.id);
  const html = rev.bodyHtml ? sanitizeArticleHtml(rev.bodyHtml) : null;
  await db
    .update(articles)
    .set({ title: rev.title, bodyJson: rev.bodyJson, bodyHtml: html, readMinutes: html ? readingMinutes(html) : null })
    .where(eq(articles.id, articleId));
  await recordAudit(db, {
    userId: actor.id,
    action: "article.restore",
    entity: "article",
    entityId: articleId,
    diff: { revisionId },
  });
}

/** Borrado lógico: sale del sitio y del listado; los bloques de portada que lo usaban se retiran. */
export async function deleteArticle(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "article:delete");
  await db
    .update(articles)
    .set({ deletedAt: sql`now()`, status: "archived" })
    .where(eq(articles.id, id));
  await db.delete(homeBlocks).where(eq(homeBlocks.articleId, id));
  await recordAudit(db, { userId: actor.id, action: "article.delete", entity: "article", entityId: id });
}
