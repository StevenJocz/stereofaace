import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { readingMinutes, sanitizeArticleHtml } from "@/lib/sanitize";
import { slugify } from "@/lib/slug";
import { articleRevisions, articles, references } from "@/modules/content/schema";
import { recordAudit } from "@/modules/users/audit";
import { clipText, parseFeed, type FeedItem } from "./feed";
import { FeedFetchError, fetchFeedText, type FetchDeps } from "./fetch";
import { sourceItems, sourceRuns, sources } from "./schema";
import { XmlError } from "./xml";

type Source = typeof sources.$inferSelect;

/** Tras tantos fallos seguidos la fuente se pausa sola (se reanuda a mano desde el panel). */
export const MAX_FAILURES = 5;
const BUSY_WINDOW_MS = 10 * 60_000;

export type RunResult = { runId: string; status: "ok" | "error"; newItems: number; duplicates: number; errors: number; skippedByLimit: number; message: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Mensaje seguro para mostrar: los errores conocidos se explican; el resto se registra en el servidor y se resume. */
function safeMessage(error: unknown): string {
  if (error instanceof FeedFetchError || error instanceof XmlError) return error.message;
  console.error("[ingest]", error);
  return "Error inesperado al leer el feed. Revisa los registros del servidor.";
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  const root = base || "articulo";
  const candidates = [root, ...Array.from({ length: 20 }, (_, i) => `${root}-${i + 2}`)];
  const taken = await db.select({ slug: articles.slug }).from(articles).where(and(eq(articles.locale, "es"), inArray(articles.slug, candidates)));
  const used = new Set(taken.map((t) => t.slug));
  return candidates.find((c) => !used.has(c)) ?? `${root}-${Date.now().toString(36)}`;
}

/**
 * Borrador de artículo a partir de un elemento del feed. Solo lleva lo que el feed publica: título, extracto, enlace y atribución;
 * la imagen solo si la política de derechos de la fuente lo permite. Nunca se publica solo: lo revisa una persona.
 */
async function createDraft(db: Db, source: Source, item: FeedItem): Promise<string> {
  const body = sanitizeArticleHtml(
    [item.summary ? `<p>${esc(item.summary)}</p>` : "", `<p>Fuente: <a href="${esc(item.url)}" rel="noopener nofollow">${esc(source.name)}</a></p>`].join(""),
  );
  const withImage = source.rightsPolicy !== "metadata_only" && item.imageUrl !== null;
  const slug = await uniqueSlug(db, slugify(item.title));
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(articles)
      .values({
        slug,
        locale: "es",
        title: item.title,
        dek: item.summary ? clipText(item.summary, 220) : null,
        bodyHtml: body,
        readMinutes: readingMinutes(body),
        categoryId: source.defaultCategoryId,
        status: "draft",
        origin: "imported",
        authorId: null,
        authorName: item.author ?? source.name,
        coverUrl: withImage ? item.imageUrl : null,
        coverAlt: withImage ? item.title : null,
        coverCredit: withImage ? `Foto: ${source.name} (imagen de la nota original)` : null,
        seo: {},
      })
      .returning({ id: articles.id });
    await tx.insert(references).values({ articleId: created.id, title: item.title, url: item.url, outlet: source.name, position: 0 });
    await tx.insert(articleRevisions).values({ articleId: created.id, title: item.title, bodyJson: null, bodyHtml: body, authorId: null });
    return created.id;
  });
}

/**
 * Una ejecución de la fuente: descarga el feed, guarda lo nuevo (idempotente por fuente+guid y por enlace), crea un borrador por
 * elemento nuevo y deja constancia en `source_runs`. Respeta el límite diario y pausa la fuente tras `MAX_FAILURES` fallos seguidos.
 */
export async function runSource(db: Db, id: string, opts: { deps?: FetchDeps; now?: Date } = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  if (!source) throw new DomainError("source_not_found", "La fuente no existe.");
  if (source.kind !== "rss" && source.kind !== "atom") throw new DomainError("source_kind", "Solo se pueden leer fuentes RSS o Atom.");
  if (!source.termsVerifiedAt) throw new DomainError("source_terms", "Verifica los términos de la fuente antes de leerla.");
  if (!source.active) throw new DomainError("source_inactive", "La fuente está desactivada. Actívala para leerla.");
  if (source.paused) throw new DomainError("source_paused", "La fuente está pausada por fallos seguidos. Reanúdala desde el panel.");
  const [busy] = await db
    .select({ id: sourceRuns.id })
    .from(sourceRuns)
    .where(and(eq(sourceRuns.sourceId, id), eq(sourceRuns.status, "running"), gte(sourceRuns.startedAt, new Date(now.getTime() - BUSY_WINDOW_MS))))
    .limit(1);
  if (busy) throw new DomainError("source_busy", "Ya hay una ejecución en curso para esta fuente.");

  const [run] = await db.insert(sourceRuns).values({ sourceId: id, startedAt: now }).returning({ id: sourceRuns.id });
  let newItems = 0;
  let duplicates = 0;
  let errors = 0;
  let skippedByLimit = 0;
  let status: "ok" | "error" = "ok";
  let message = "";
  try {
    const items = parseFeed(await fetchFeedText(source.url, opts.deps), source.url);
    const known = items.length
      ? new Set((await db.select({ url: sourceItems.url }).from(sourceItems).where(and(eq(sourceItems.sourceId, id), inArray(sourceItems.url, items.map((i) => i.url))))).map((r) => r.url))
      : new Set<string>();
    const [{ n }] = await db
      .select({ n: count() })
      .from(sourceItems)
      .where(and(eq(sourceItems.sourceId, id), gte(sourceItems.createdAt, new Date(now.getTime() - 24 * 3_600_000))));
    let budget = Math.max(0, source.dailyLimit - n);

    for (const item of items) {
      if (known.has(item.url)) {
        duplicates++;
        continue;
      }
      if (budget <= 0) {
        skippedByLimit++; // no se guarda: la próxima ejecución lo retoma
        continue;
      }
      const [slot] = await db
        .insert(sourceItems)
        .values({
          sourceId: id,
          guid: item.guid,
          url: item.url,
          title: item.title,
          summary: item.summary,
          publishedAt: item.publishedAt,
          contentHash: createHash("sha256").update(`${item.title}\n${item.url}`).digest("hex"),
          status: "processing",
        })
        .onConflictDoNothing()
        .returning({ id: sourceItems.id });
      if (!slot) {
        duplicates++;
        continue;
      }
      budget--;
      try {
        const articleId = await createDraft(db, source, item);
        await db.update(sourceItems).set({ status: "pending_review", articleId }).where(eq(sourceItems.id, slot.id));
        newItems++;
      } catch (e) {
        errors++;
        await db.update(sourceItems).set({ status: "error", error: safeMessage(e).slice(0, 300) }).where(eq(sourceItems.id, slot.id));
      }
    }
    message = items.length === 0 ? "El feed no trae elementos." : `${items.length} en el feed: ${newItems} nuevos, ${duplicates} ya conocidos${skippedByLimit ? `, ${skippedByLimit} aplazados por el límite diario` : ""}${errors ? `, ${errors} con error` : ""}.`;
    if (items.length > 0 && newItems === 0 && errors === items.length) status = "error";
  } catch (e) {
    status = "error";
    message = safeMessage(e);
  }

  const failures = status === "ok" ? 0 : source.consecutiveFailures + 1;
  const pause = failures >= MAX_FAILURES;
  await db.update(sourceRuns).set({ finishedAt: new Date(), status, newItems, duplicates, errors, log: { message, skippedByLimit } }).where(eq(sourceRuns.id, run.id));
  await db.update(sources).set({ lastRunAt: now, consecutiveFailures: failures, paused: source.paused || pause }).where(eq(sources.id, id));
  if (pause) message += ` La fuente se pausó tras ${MAX_FAILURES} fallos seguidos.`;
  return { runId: run.id, status, newItems, duplicates, errors, skippedByLimit, message };
}

/** Fuentes que ya les toca (activas, verificadas, sin pausa y con el intervalo cumplido), reclamadas una a una para no duplicar. */
export async function runDueSources(db: Db, opts: { deps?: FetchDeps; now?: Date } = {}): Promise<{ id: string; result: RunResult | { error: string } }[]> {
  const now = opts.now ?? new Date();
  const due = sql`(${sources.lastRunAt} IS NULL OR ${sources.lastRunAt} <= ${now.toISOString()}::timestamptz - (${sources.intervalMinutes} * interval '1 minute'))`;
  const candidates = await db
    .select({ id: sources.id })
    .from(sources)
    .where(and(eq(sources.active, true), eq(sources.paused, false), isNotNull(sources.termsVerifiedAt), inArray(sources.kind, ["rss", "atom"]), due))
    .orderBy(asc(sources.lastRunAt));
  const out: { id: string; result: RunResult | { error: string } }[] = [];
  for (const { id } of candidates) {
    const claimed = await db.update(sources).set({ lastRunAt: now }).where(and(eq(sources.id, id), due)).returning({ id: sources.id });
    if (claimed.length === 0) continue; // otro proceso la tomó
    try {
      out.push({ id, result: await runSource(db, id, { ...opts, now }) });
    } catch (e) {
      out.push({ id, result: { error: e instanceof DomainError ? e.message : safeMessage(e) } });
    }
  }
  return out;
}

/* ───────────── Acciones del panel ───────────── */

export type FeedProbe = { ok: true; total: number; withImage: number; withSummary: number; sample: { title: string; url: string; publishedAt: string | null }[] } | { ok: false; message: string };

/** «Probar el feed»: lo descarga y lo lee, sin guardar nada. Sirve para comprobar la dirección antes de activar la fuente. */
export async function probeSource(db: Db, actor: Actor | null, id: string, deps?: FetchDeps): Promise<FeedProbe> {
  assertCan(actor, "source:manage");
  const [source] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  if (!source) throw new DomainError("source_not_found", "La fuente no existe.");
  try {
    const items = parseFeed(await fetchFeedText(source.url, deps), source.url);
    return {
      ok: true,
      total: items.length,
      withImage: items.filter((i) => i.imageUrl).length,
      withSummary: items.filter((i) => i.summary).length,
      sample: items.slice(0, 3).map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt?.toISOString() ?? null })),
    };
  } catch (e) {
    return { ok: false, message: safeMessage(e) };
  }
}

export async function runSourceNow(db: Db, actor: Actor | null, id: string, deps?: FetchDeps): Promise<RunResult> {
  assertCan(actor, "source:manage");
  const result = await runSource(db, id, { deps });
  await recordAudit(db, { userId: actor?.id, action: "source.run", entity: "source", entityId: id, diff: { status: result.status, newItems: result.newItems } });
  return result;
}

export async function resumeSource(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "source:manage");
  await db.update(sources).set({ paused: false, consecutiveFailures: 0 }).where(eq(sources.id, id));
  await recordAudit(db, { userId: actor?.id, action: "source.resume", entity: "source", entityId: id });
}

export type RunRow = typeof sourceRuns.$inferSelect;

export async function listRuns(db: Db, actor: Actor | null, sourceId: string, limit = 10): Promise<RunRow[]> {
  assertCan(actor, "source:read");
  return db.select().from(sourceRuns).where(eq(sourceRuns.sourceId, sourceId)).orderBy(desc(sourceRuns.startedAt)).limit(limit);
}

/** Cuántos elementos de la fuente esperan revisión (borradores creados y aún no publicados ni rechazados). */
export async function pendingCount(db: Db, actor: Actor | null, sourceId: string): Promise<number> {
  assertCan(actor, "source:read");
  const [r] = await db.select({ n: count() }).from(sourceItems).where(and(eq(sourceItems.sourceId, sourceId), eq(sourceItems.status, "pending_review"), isNull(sourceItems.error)));
  return r.n;
}

