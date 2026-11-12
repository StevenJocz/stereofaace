import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { listSitemapEntries } from "@/modules/content/service";
import { listPublishedPageSlugs } from "@/modules/content/pages-admin";
import { listArtistSlugs } from "@/modules/artists/profile";

/** Sitemap dinámico: solo artículos públicos (publicados o programados con fecha cumplida). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const db = await getDb();
  const [entries, fixedPages, artistPages] = await Promise.all([
    listSitemapEntries(db),
    listPublishedPageSlugs(db),
    listArtistSlugs(db),
  ]);
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/noticias`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/artistas`, changeFrequency: "weekly" as const, priority: 0.6 },
    ...artistPages.map((a) => ({
      url: `${SITE_URL}/artistas/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...fixedPages.map((p) => ({
      url: `${SITE_URL}/pagina/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...entries.map((e) => ({
      url: `${SITE_URL}/noticias/${e.slug}`,
      lastModified: e.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
