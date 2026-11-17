import { randomBytes, timingSafeEqual } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { assertCan, type Actor } from "@/lib/rbac";
import { articles } from "@/modules/content/schema";
import { siteSettings } from "@/modules/settings/schema";
import { recordAudit } from "@/modules/users/audit";
import { socialPosts } from "./schema";

const KEY = "social.facebook";
const NETWORK = "facebook";
const GRAPH = "https://graph.facebook.com/v21.0/me/feed"; // con un token de PÁGINA, «me» es la página
const MAX_ATTEMPTS = 3;

const stored = z.object({
  enabled: z.boolean().default(false),
  token: z.string().default(""),
  since: z.string().nullable().default(null),
  /** Clave de la ruta /api/social/sync que usa un monitor externo para publicar las notas programadas. */
  syncToken: z.string().default(""),
});

async function read(db: Db) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, KEY));
  const parsed = stored.safeParse(row?.value);
  return parsed.success ? parsed.data : { enabled: false, token: "", since: null as string | null, syncToken: "" };
}

/** Para los ajustes del panel: nunca incluye el token. */
export async function getFacebookConfig(db: Db, actor: Actor | null) {
  assertCan(actor, "setting:update");
  const c = await read(db);
  return { enabled: c.enabled, hasToken: c.token !== "", since: c.since, syncToken: c.syncToken };
}

export const facebookInputSchema = z.object({
  enabled: z.boolean(),
  /** Vacío conserva el guardado. */
  token: z.string().trim().max(1000).optional(),
});
export type FacebookInput = z.input<typeof facebookInputSchema>;

/** Al activar se anota desde cuándo se publica: las notas anteriores nunca se suben. */
export async function saveFacebookConfig(db: Db, actor: Actor | null, raw: FacebookInput): Promise<void> {
  assertCan(actor, "setting:update");
  const input = facebookInputSchema.parse(raw);
  const cur = await read(db);
  const value = {
    enabled: input.enabled,
    token: input.token ? input.token : cur.token,
    since: input.enabled && (!cur.enabled || !cur.since) ? new Date().toISOString() : cur.since,
    syncToken: cur.syncToken || randomBytes(16).toString("hex"),
  };
  await db
    .insert(siteSettings)
    .values({ key: KEY, value, updatedBy: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id } });
  await recordAudit(db, { userId: actor.id, action: "social.facebook.update", entity: "settings", diff: { enabled: value.enabled, tokenChanged: Boolean(input.token) } });
}

/** Mensaje y enlace de la publicación: titular + bajada (recortada) y la nota en el sitio. */
export function buildFacebookPost(a: { title: string; dek: string | null; slug: string }, siteUrl: string): { message: string; link: string } {
  const dek = (a.dek ?? "").trim();
  const message = dek ? `${a.title}\n\n${dek}` : a.title;
  return { message: message.length > 500 ? `${message.slice(0, 497)}…` : message, link: `${siteUrl.replace(/\/$/, "")}/noticias/${a.slug}` };
}

type Opts = { fetchImpl?: typeof fetch; siteUrl?: string; force?: boolean; now?: Date };
export type PublishResult = { status: "posted" | "skipped" | "failed"; error?: string };

const isPublic = (now: Date) =>
  and(
    isNull(articles.deletedAt),
    or(and(eq(articles.status, "published"), lte(articles.publishedAt, now)), and(eq(articles.status, "scheduled"), lte(articles.scheduledFor, now))),
  );

async function callGraph(token: string, post: { message: string; link: string }, fetchImpl: typeof fetch): Promise<string> {
  const res = await fetchImpl(GRAPH, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ message: post.message, link: post.link, access_token: token }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || !body.id) throw new Error(body.error?.message ?? `Facebook respondió con el error ${res.status}.`);
  return body.id;
}

/** Publica una nota en la página de Facebook. Idempotente: no repite una nota ya publicada (salvo `force`). */
export async function publishArticleToFacebook(db: Db, articleId: string, opts: Opts = {}): Promise<PublishResult> {
  const cfg = await read(db);
  if (!cfg.enabled || !cfg.token) return { status: "skipped" };
  const now = opts.now ?? new Date();
  const [a] = await db
    .select({ id: articles.id, slug: articles.slug, title: articles.title, dek: articles.dek })
    .from(articles)
    .where(and(eq(articles.id, articleId), isPublic(now)));
  if (!a) return { status: "skipped" };
  const [prev] = await db.select().from(socialPosts).where(and(eq(socialPosts.articleId, articleId), eq(socialPosts.network, NETWORK)));
  if (prev?.status === "posted" && !opts.force) return { status: "skipped" };

  const attempts = (prev?.attempts ?? 0) + 1;
  try {
    const externalId = await callGraph(cfg.token, buildFacebookPost(a, opts.siteUrl ?? SITE_URL), opts.fetchImpl ?? fetch);
    await db
      .insert(socialPosts)
      .values({ articleId, network: NETWORK, status: "posted", externalId, attempts, postedAt: now })
      .onConflictDoUpdate({ target: [socialPosts.articleId, socialPosts.network], set: { status: "posted", externalId, error: null, attempts, postedAt: now } });
    return { status: "posted" };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Error desconocido.").replaceAll(cfg.token, "***").slice(0, 400);
    await db
      .insert(socialPosts)
      .values({ articleId, network: NETWORK, status: "failed", error: message, attempts })
      .onConflictDoUpdate({ target: [socialPosts.articleId, socialPosts.network], set: { status: "failed", error: message, attempts } });
    return { status: "failed", error: message };
  }
}

/** Publica las notas públicas pendientes (desde la activación, sin publicar y con menos de 3 intentos fallidos). */
export async function syncFacebook(db: Db, opts: Opts & { limit?: number } = {}): Promise<{ posted: number; failed: number }> {
  const cfg = await read(db);
  if (!cfg.enabled || !cfg.token || !cfg.since) return { posted: 0, failed: 0 };
  const now = opts.now ?? new Date();
  const effective = sql<Date>`coalesce(${articles.publishedAt}, ${articles.scheduledFor})`;
  const rows = await db
    .select({ id: articles.id })
    .from(articles)
    .leftJoin(socialPosts, and(eq(socialPosts.articleId, articles.id), eq(socialPosts.network, NETWORK)))
    .where(
      and(
        isPublic(now),
        sql`${effective} >= ${cfg.since}`,
        or(isNull(socialPosts.id), and(eq(socialPosts.status, "failed"), sql`${socialPosts.attempts} < ${MAX_ATTEMPTS}`)),
      ),
    )
    .orderBy(asc(effective))
    .limit(opts.limit ?? 5);
  let posted = 0;
  let failed = 0;
  for (const r of rows) {
    const res = await publishArticleToFacebook(db, r.id, { ...opts, now });
    if (res.status === "posted") posted++;
    else if (res.status === "failed") failed++;
  }
  return { posted, failed };
}

/** Estado de una nota en Facebook, para el editor. */
export async function getArticleSocial(db: Db, actor: Actor | null, articleId: string) {
  assertCan(actor, "article:read");
  const [row] = await db
    .select({ status: socialPosts.status, error: socialPosts.error, postedAt: socialPosts.postedAt, attempts: socialPosts.attempts })
    .from(socialPosts)
    .where(and(eq(socialPosts.articleId, articleId), eq(socialPosts.network, NETWORK)));
  return row ?? null;
}

/** Comprueba, sin pistas de tiempo, la clave de la ruta de sincronización. */
export async function verifyFacebookSyncToken(db: Db, token: string): Promise<boolean> {
  const { syncToken } = await read(db);
  if (!syncToken || !token) return false;
  const a = Buffer.from(syncToken);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}
