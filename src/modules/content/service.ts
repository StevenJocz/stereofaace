import { and, asc, count, desc, eq, inArray, isNotNull, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { categories, tags } from "@/modules/taxonomy/schema";
import { listFeaturedArtists, type ArtistCard } from "@/modules/artists/service";
import { listLatestReleases, type ReleaseCard } from "@/modules/releases/service";
import { listUpcomingEvents, type EventCard } from "@/modules/events/service";
import { articleTags, articles, homeBlocks, references, type HeroConfig } from "./schema";
import { listArticlesQuerySchema, type ListArticlesQuery } from "./validators";

/* ───────────── Modelos de lectura ───────────── */

export type StoryCard = {
  id: string;
  slug: string;
  title: string;
  kicker: string | null;
  dek: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  authorName: string | null;
  publishedAt: Date;
  readMinutes: number | null;
  coverArt: CoverArt | null;
  coverUrl: string | null;
  coverAlt: string | null;
  isDemo: boolean;
};

export type HeroSlide = StoryCard & { config: HeroConfig };

export type HomeData = {
  hero: HeroSlide[];
  features: StoryCard[];
  recent: StoryCard[];
  latest: StoryCard[];
  electronica: StoryCard[];
  indie: StoryCard[];
  artists: ArtistCard[];
  releases: ReleaseCard[];
  events: EventCard[];
  sections: string[];
};

const cardColumns = {
  id: articles.id,
  slug: articles.slug,
  title: articles.title,
  kicker: articles.kicker,
  dek: articles.dek,
  authorName: articles.authorName,
  publishedAt: articles.publishedAt,
  readMinutes: articles.readMinutes,
  coverArt: articles.coverArt,
  coverUrl: articles.coverUrl,
  coverAlt: articles.coverAlt,
  isDemo: articles.isDemo,
  categorySlug: categories.slug,
  categoryName: categories.name,
};

type CardRow = Omit<StoryCard, "publishedAt"> & { publishedAt: Date | null };
const toCard = (r: CardRow): StoryCard => ({ ...r, publishedAt: r.publishedAt ?? new Date(0) });

/** Un artículo es público si está publicado (o programado con fecha cumplida) y no está borrado. */
const isPublic = (now: Date): SQL | undefined =>
  and(
    isNull(articles.deletedAt),
    or(
      and(eq(articles.status, "published"), lte(articles.publishedAt, now)),
      // Programados: pasan a ser públicos solos cuando llega su fecha (sin tarea en segundo plano).
      and(eq(articles.status, "scheduled"), lte(articles.scheduledFor, now)),
    ),
  );

/* ───────────── Lectura pública ───────────── */

async function blocksOf(db: Db, kind: "hero" | "feature", now: Date) {
  return db
    .select({ ...cardColumns, config: homeBlocks.config })
    .from(homeBlocks)
    .innerJoin(articles, eq(articles.id, homeBlocks.articleId))
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(and(eq(homeBlocks.kind, kind), eq(homeBlocks.active, true), isPublic(now)))
    .orderBy(asc(homeBlocks.position));
}

async function latestIn(
  db: Db,
  now: Date,
  excludeIds: string[],
  limit: number,
  categorySlug?: string,
  onlyWithPhoto = false,
): Promise<StoryCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(
      and(
        isPublic(now),
        excludeIds.length ? notInArray(articles.id, excludeIds) : undefined,
        categorySlug ? eq(categories.slug, categorySlug) : undefined,
        onlyWithPhoto ? isNotNull(articles.coverUrl) : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toCard);
}

/** Artículos públicos por id (por ejemplo, las noticias etiquetadas con un artista), del más reciente al más antiguo. */
export async function listPublicArticlesByIds(db: Db, ids: string[], limit = 12, now = new Date()): Promise<StoryCard[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(cardColumns)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(and(isPublic(now), inArray(articles.id, ids)))
    .orderBy(desc(articles.publishedAt))
    .limit(limit);
  return rows.map(toCard);
}

/** Cuántos slides tiene el carrusel y cuántas tarjetas destacadas hay bajo él. */
export const HERO_SIZE = 4;
export const FEATURE_SIZE = 4;

/** Datos de presentación de un slide cuando nadie los escribió: salen del propio artículo. */
function autoHeroConfig(c: StoryCard): HeroConfig {
  const meta = [c.kicker, c.readMinutes ? `${c.readMinutes} min` : null].filter(Boolean).join(" · ");
  return {
    lines: [],
    place: "StereoFace · Colombia",
    cta: "Leer más",
    ...(meta ? { meta } : {}),
    path: ["Música", "Cultura", c.categoryName ?? "Escena"],
  } as unknown as HeroConfig;
}

/**
 * Todo lo que necesita la portada, en una sola llamada del servidor.
 *
 * La portada se arma sola: el carrusel toma los artículos publicados más recientes (con foto primero) y las
 * tarjetas destacadas, los siguientes más recientes. Ninguno se repite entre carrusel, destacados y el resto de
 * secciones. Los bloques fijados a mano en el panel (opcionales) van primero y el resto se completa automáticamente.
 */
export async function getHomeData(db: Db, now = new Date()): Promise<HomeData> {
  const [pinnedHeroRows, pinnedFeatureRows] = await Promise.all([blocksOf(db, "hero", now), blocksOf(db, "feature", now)]);
  const pinnedHero: HeroSlide[] = pinnedHeroRows.map(({ config, ...r }) => ({ ...toCard(r), config: config as HeroConfig }));
  // Los bloques «feature» no usan `config`: se descarta para no filtrarlo al modelo de lectura.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pinnedFeatures = pinnedFeatureRows.map(({ config, ...r }) => toCard(r));
  const taken = [...pinnedHero, ...pinnedFeatures].map((a) => a.id);

  const needHero = Math.max(0, HERO_SIZE - pinnedHero.length);
  const withPhoto = needHero ? await latestIn(db, now, taken, needHero, undefined, true) : [];
  const fill =
    needHero - withPhoto.length > 0
      ? await latestIn(db, now, [...taken, ...withPhoto.map((a) => a.id)], needHero - withPhoto.length)
      : [];
  const autoHero: HeroSlide[] = [...withPhoto, ...fill].map((c) => ({ ...c, config: autoHeroConfig(c) }));
  const hero = [...pinnedHero, ...autoHero].slice(0, HERO_SIZE);

  const needFeatures = Math.max(0, FEATURE_SIZE - pinnedFeatures.length);
  const autoFeatures = needFeatures
    ? await latestIn(db, now, [...taken, ...autoHero.map((a) => a.id)], needFeatures)
    : [];
  const features = [...pinnedFeatures, ...autoFeatures].slice(0, FEATURE_SIZE);
  const blockIds = [...hero, ...features].map((a) => a.id);

  const [feed, electronica, indie, artists, releases, events, sectionRows] = await Promise.all([
    latestIn(db, now, blockIds, 8),
    latestIn(db, now, blockIds, 3, "electronica"),
    latestIn(db, now, blockIds, 3, "indie"),
    listFeaturedArtists(db, 4),
    listLatestReleases(db, 6, now),
    listUpcomingEvents(db, { limit: 6 }, now),
    db.select({ name: categories.name }).from(categories).orderBy(asc(categories.position)).limit(8),
  ]);

  return {
    hero,
    features,
    recent: feed.slice(0, 3),
    latest: feed.slice(3, 8),
    electronica,
    indie,
    artists,
    releases,
    events,
    sections: sectionRows.map((s) => s.name),
  };
}

export type ArticlePage = { items: StoryCard[]; total: number; page: number; pageSize: number };

/** Listado público con filtro por categoría y búsqueda de texto completo en español. */
export async function listPublishedArticles(
  db: Db,
  rawQuery: Partial<ListArticlesQuery> = {},
  now = new Date(),
): Promise<ArticlePage> {
  const q = listArticlesQuerySchema.parse(rawQuery);
  const where = and(
    isPublic(now),
    q.category ? eq(categories.slug, q.category) : undefined,
    q.q
      ? sql`to_tsvector('spanish', coalesce(${articles.title}, '') || ' ' || coalesce(${articles.dek}, '')) @@ websearch_to_tsquery('spanish', ${q.q})`
      : undefined,
  );
  const [rows, totals] = await Promise.all([
    db
      .select(cardColumns)
      .from(articles)
      .leftJoin(categories, eq(categories.id, articles.categoryId))
      .where(where)
      .orderBy(desc(articles.publishedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: count() }).from(articles).leftJoin(categories, eq(categories.id, articles.categoryId)).where(where),
  ]);
  return { items: rows.map(toCard), total: totals[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
}

export type ArticleFull = StoryCard & {
  bodyHtml: string | null;
  seo: { title?: string; description?: string; canonical?: string; noindex?: boolean; ogImage?: string };
  layout: "standard" | "special";
  coverCredit: string | null;
  updatedAt: Date;
  tags: string[];
  references: { title: string; url: string; outlet: string | null }[];
};

/** Artículo público completo (cuerpo ya sanitizado al guardar), con etiquetas y fuentes. */
export async function getArticleBySlug(
  db: Db,
  slug: string,
  locale = "es",
  now = new Date(),
): Promise<ArticleFull | null> {
  const rows = await db
    .select({
      ...cardColumns,
      bodyHtml: articles.bodyHtml,
      seo: articles.seo,
      layout: articles.layout,
      coverCredit: articles.coverCredit,
      updatedAt: articles.updatedAt,
      scheduledFor: articles.scheduledFor,
    })
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(and(eq(articles.slug, slug), eq(articles.locale, locale), isPublic(now)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const [tagRows, refRows] = await Promise.all([
    db
      .select({ name: tags.name })
      .from(articleTags)
      .innerJoin(tags, eq(tags.id, articleTags.tagId))
      .where(eq(articleTags.articleId, r.id)),
    db.select().from(references).where(eq(references.articleId, r.id)).orderBy(asc(references.position)),
  ]);
  const { scheduledFor, ...rest } = r;
  return {
    ...toCard({ ...rest, publishedAt: rest.publishedAt ?? scheduledFor }),
    bodyHtml: r.bodyHtml,
    seo: r.seo,
    layout: r.layout,
    coverCredit: r.coverCredit,
    updatedAt: r.updatedAt,
    tags: tagRows.map((t) => t.name),
    references: refRows.map((x) => ({ title: x.title, url: x.url, outlet: x.outlet })),
  };
}

/** Relacionados: misma categoría primero; si faltan, lo más reciente. */
export async function getRelatedArticles(
  db: Db,
  article: Pick<StoryCard, "id" | "categorySlug">,
  limit = 3,
  now = new Date(),
) {
  const same = article.categorySlug ? await latestIn(db, now, [article.id], limit, article.categorySlug) : [];
  if (same.length >= limit) return same;
  const more = await latestIn(db, now, [article.id, ...same.map((x) => x.id)], limit - same.length);
  return [...same, ...more];
}

/** Entradas del sitemap: artículos públicos con su última modificación (hasta 5000). */
export async function listSitemapEntries(db: Db, now = new Date()) {
  return db
    .select({ slug: articles.slug, updatedAt: articles.updatedAt })
    .from(articles)
    .where(and(isPublic(now), eq(articles.locale, "es")))
    .orderBy(desc(articles.updatedAt))
    .limit(5000);
}
