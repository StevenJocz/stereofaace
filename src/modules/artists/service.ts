import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { media } from "@/modules/media/schema";
import { genres } from "@/modules/taxonomy/schema";
import { artistGenres, artists } from "./schema";

export type ArtistCard = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  genre: string | null;
  coverArt: CoverArt | null;
  /** Foto subida desde el panel (ruta /media/<clave>); si existe, sustituye a la ilustración. */
  imageUrl: string | null;
  isDemo: boolean;
};

export async function listFeaturedArtists(db: Db, limit = 4): Promise<ArtistCard[]> {
  const rows = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      name: artists.name,
      country: artists.country,
      coverArt: artists.coverArt,
      photoKey: media.storageKey,
      isDemo: artists.isDemo,
    })
    .from(artists)
    .leftJoin(media, eq(media.id, artists.photoId))
    .where(and(eq(artists.featured, true), isNull(artists.deletedAt)))
    .orderBy(asc(artists.name))
    .limit(limit);
  if (rows.length === 0) return [];

  const links = await db
    .select({ artistId: artistGenres.artistId, name: genres.name })
    .from(artistGenres)
    .innerJoin(genres, eq(genres.id, artistGenres.genreId))
    .where(
      inArray(
        artistGenres.artistId,
        rows.map((r) => r.id),
      ),
    );
  const first = new Map<string, string>();
  for (const l of links) if (!first.has(l.artistId)) first.set(l.artistId, l.name);

  return rows.map(({ photoKey, ...r }) => ({
    ...r,
    imageUrl: photoKey ? `/media/${photoKey}` : null,
    genre: first.get(r.id) ?? null,
  }));
}
