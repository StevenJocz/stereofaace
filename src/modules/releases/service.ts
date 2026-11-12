import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { artists } from "@/modules/artists/schema";
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
