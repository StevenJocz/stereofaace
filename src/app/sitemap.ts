import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { includeInSitemap } from "@/lib/seo";
import { listSitemapEntries } from "@/modules/content/service";
import { listPublishedPageSlugs } from "@/modules/content/pages-admin";
import { listArtistSlugs } from "@/modules/artists/profile";
import { listPublicPrograms } from "@/modules/schedule/public";
import { listEventSlugs } from "@/modules/events/service";
import { listReleaseSlugs } from "@/modules/releases/service";

/** Sitemap dinámico: solo artículos públicos (publicados o programados con fecha cumplida). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const db = await getDb();
  const [entries, fixedPages, artistPages, programs, eventPages, releasePages] = await Promise.all([
    listSitemapEntries(db),
    listPublishedPageSlugs(db),
    listArtistSlugs(db),
    listPublicPrograms(db),
    listEventSlugs(db),
    listReleaseSlugs(db),
  ]);
  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/noticias`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/artistas`, changeFrequency: "weekly" as const, priority: 0.6 },
    ...releasePages.map((r) => ({ url: `${SITE_URL}/lanzamientos/${r.slug}`, lastModified: r.updatedAt, changeFrequency: "monthly" as const, priority: 0.5 })),
    { url: `${SITE_URL}/agenda`, changeFrequency: "daily" as const, priority: 0.7 },
    ...eventPages.map((e) => ({ url: `${SITE_URL}/agenda/${e.slug}`, lastModified: e.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
    { url: `${SITE_URL}/programas`, changeFrequency: "weekly" as const, priority: 0.6 },
    ...programs.map((p) => ({ url: `${SITE_URL}/programas/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.5 })),
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
    ...entries.filter((e) => includeInSitemap(e.seo, `${SITE_URL}/noticias/${e.slug}`)).map((e) => ({
      url: `${SITE_URL}/noticias/${e.slug}`,
      lastModified: e.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
