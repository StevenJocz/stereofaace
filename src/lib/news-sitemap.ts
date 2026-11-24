import { includeInSitemap } from "./seo";

type NewsItem = { slug: string; title: string; createdAt: Date; publishedAt: Date | null; seo: { noindex?: boolean; canonical?: string }; origin: "manual" | "imported"; isDemo: boolean };
const xml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** Solo novedades editoriales originales de los dos últimos días, sin duplicados canónicos ni demos. */
export function buildNewsSitemap(items: NewsItem[], siteUrl: string, now = new Date()): string {
  const cutoff = now.getTime() - 48 * 60 * 60 * 1000;
  const base = siteUrl.replace(/\/$/, "");
  const entries = items.filter((item) => {
    const published = item.publishedAt?.getTime();
    const created = item.createdAt.getTime();
    return item.origin === "manual" && !item.isDemo && published !== undefined && published >= cutoff && published <= now.getTime() && created >= cutoff && created <= now.getTime() && includeInSitemap(item.seo, `${base}/noticias/${item.slug}`);
  }).slice(0, 1000).map((item) => `<url><loc>${xml(`${base}/noticias/${item.slug}`)}</loc><news:news><news:publication><news:name>StereoFace</news:name><news:language>es</news:language></news:publication><news:publication_date>${item.publishedAt!.toISOString()}</news:publication_date><news:title>${xml(item.title)}</news:title></news:news></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${entries}</urlset>`;
}
