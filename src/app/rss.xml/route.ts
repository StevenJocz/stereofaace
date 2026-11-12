import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { listPublishedArticles } from "@/modules/content/service";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** RSS 2.0 propio con los 30 artículos más recientes. */
export async function GET() {
  try {
    const { items } = await listPublishedArticles(await getDb(), { page: 1, pageSize: 30 });
    const last = items[0]?.publishedAt ?? new Date();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>StereoFace</title>
<link>${esc(SITE_URL)}</link>
<description>Música electrónica, indie y cultura underground.</description>
<language>es</language>
<lastBuildDate>${last.toUTCString()}</lastBuildDate>
<atom:link href="${esc(SITE_URL)}/rss.xml" rel="self" type="application/rss+xml"/>
${items
  .map(
    (a) => `<item>
<title>${esc(a.title)}</title>
<link>${esc(`${SITE_URL}/noticias/${a.slug}`)}</link>
<guid isPermaLink="true">${esc(`${SITE_URL}/noticias/${a.slug}`)}</guid>
<pubDate>${a.publishedAt.toUTCString()}</pubDate>${a.categoryName ? `\n<category>${esc(a.categoryName)}</category>` : ""}${a.dek ? `\n<description>${esc(a.dek)}</description>` : ""}
</item>`,
  )
  .join("\n")}
</channel>
</rss>`;
    return new Response(xml, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("[rss]", error);
    return new Response("No disponible", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
