import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { buildNewsSitemap } from "@/lib/news-sitemap";
import { SITE_URL } from "@/lib/site";
import { listRecentNewsSitemapEntries } from "@/modules/content/service";

export async function GET() {
  await connection();
  const now = new Date();
  const items = await listRecentNewsSitemapEntries(await getDb(), now);
  return new Response(buildNewsSitemap(items, SITE_URL, now), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
