import { and, asc, desc, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { artists } from "@/modules/artists/schema";
import { media } from "@/modules/media/schema";
import { releaseArtists, releases, type ReleaseKind } from "./schema";

export type ReleaseCard = {
  id: string;
  slug: string;
  title: string;
  kind: ReleaseKind;
  releasedAt: Date;
  label: string | null;
  artistNames: string[];
  coverArt: CoverArt | null;
  isDemo: boolean;
};

/** Lanzamientos publicados desde `since` (por defecto, hace 30 días), del más próximo al más lejano. */
export async function listLatestReleases(db: Db, limit = 6, now = new Date()): Promise<ReleaseCard[]> {
  const since = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const rows = await db
    .select({
      id: releases.id,
      slug: releases.slug,
      title: releases.title,
      kind: releases.kind,
      releasedAt: releases.releasedAt,
      label: releases.label,
      coverArt: releases.coverArt,
      isDemo: releases.isDemo,
    })
    .from(releases)
    .where(and(eq(releases.status, "published"), isNull(releases.deletedAt), gte(releases.releasedAt, since)))
    .orderBy(asc(releases.releasedAt), asc(releases.title))
    .limit(limit);
  if (rows.length === 0) return [];

  const credits = await db
    .select({ releaseId: releaseArtists.releaseId, name: artists.name, position: releaseArtists.position })
    .from(releaseArtists)
    .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
    .where(
      inArray(
        releaseArtists.releaseId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(releaseArtists.position));
  const byRelease = new Map<string, string[]>();
  for (const c of credits) byRelease.set(c.releaseId, [...(byRelease.get(c.releaseId) ?? []), c.name]);

  return rows.map((r) => ({ ...r, artistNames: byRelease.get(r.id) ?? [] }));
}

export type ReleasePage = {
  id: string;
  slug: string;
  title: string;
  kind: ReleaseKind;
  releasedAt: Date;
  label: string | null;
  description: string | null;
  embedUrl: string | null;
  coverUrl: string | null;
  coverArt: CoverArt | null;
  coverCredit: { alt: string | null; credit: string | null } | null;
  isDemo: boolean;
  artists: { name: string; slug: string }[];
  /** Otros lanzamientos publicados de los mismos artistas. */
  more: { slug: string; title: string; kind: ReleaseKind; releasedAt: Date; artistNames: string[] }[];
};

/** Ficha pública de un lanzamiento publicado (sin borradores ni borrados). */
export async function getReleasePage(db: Db, slug: string): Promise<ReleasePage | null> {
  const [r] = await db
    .select({ rel: releases, coverKey: media.storageKey, alt: media.alt, credit: media.credit })
    .from(releases)
    .leftJoin(media, eq(media.id, releases.coverId))
    .where(and(eq(releases.slug, slug), eq(releases.status, "published"), isNull(releases.deletedAt)));
  if (!r) return null;
  const rel = r.rel;
  const credited = await db
    .select({ id: artists.id, name: artists.name, slug: artists.slug })
    .from(releaseArtists)
    .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
    .where(and(eq(releaseArtists.releaseId, rel.id), isNull(artists.deletedAt)))
    .orderBy(asc(releaseArtists.position));
  const ids = credited.map((a) => a.id);
  const others = ids.length
    ? await db
        .selectDistinct({ id: releases.id, slug: releases.slug, title: releases.title, kind: releases.kind, releasedAt: releases.releasedAt })
        .from(releaseArtists)
        .innerJoin(releases, eq(releases.id, releaseArtists.releaseId))
        .where(and(inArray(releaseArtists.artistId, ids), ne(releases.id, rel.id), eq(releases.status, "published"), isNull(releases.deletedAt)))
        .orderBy(desc(releases.releasedAt))
        .limit(4)
    : [];
  const names = others.length
    ? await db
        .select({ releaseId: releaseArtists.releaseId, name: artists.name })
        .from(releaseArtists)
        .innerJoin(artists, eq(artists.id, releaseArtists.artistId))
        .where(inArray(releaseArtists.releaseId, others.map((o) => o.id)))
        .orderBy(asc(releaseArtists.position))
    : [];
  return {
    id: rel.id,
    slug: rel.slug,
    title: rel.title,
    kind: rel.kind,
    releasedAt: rel.releasedAt,
    label: rel.label,
    description: rel.description,
    embedUrl: rel.embedUrl,
    coverUrl: r.coverKey ? `/media/${r.coverKey}` : null,
    coverArt: rel.coverArt,
    coverCredit: r.coverKey ? { alt: r.alt, credit: r.credit } : null,
    isDemo: rel.isDemo,
    artists: credited.map((a) => ({ name: a.name, slug: a.slug })),
    more: others.map((o) => ({ slug: o.slug, title: o.title, kind: o.kind, releasedAt: o.releasedAt, artistNames: names.filter((n) => n.releaseId === o.id).map((n) => n.name) })),
  };
}

/** Slugs de los lanzamientos públicos (mapa del sitio). */
export async function listReleaseSlugs(db: Db): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: releases.slug, updatedAt: releases.updatedAt })
    .from(releases)
    .where(and(eq(releases.status, "published"), isNull(releases.deletedAt)))
    .orderBy(desc(releases.releasedAt))
    .limit(500);
}
