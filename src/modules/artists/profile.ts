import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { media } from "@/modules/media/schema";
import { articleEntities } from "@/modules/content/schema";
import { listPublicArticlesByIds, type StoryCard } from "@/modules/content/service";
import { events, eventArtists, type EventKind } from "@/modules/events/schema";
import { releaseArtists, releases, type ReleaseKind } from "@/modules/releases/schema";
import { genres } from "@/modules/taxonomy/schema";
import { artistGenres, artists, type ArtistLinks } from "./schema";

export type ProfileRelease = { id: string; slug: string; title: string; kind: ReleaseKind; releasedAt: Date; label: string | null };
export type ProfileEvent = {
  id: string;
  slug: string;
  name: string;
  kind: EventKind;
  startsAt: Date;
  city: string;
  country: string;
  venue: string | null;
  ticketUrl: string | null;
};
export type ArtistProfile = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  bio: string | null;
  genres: string[];
  links: ArtistLinks;
  imageUrl: string | null;
  /** Texto alternativo, autor y licencia de la foto subida (para el pie de foto). */
  photoCredit: { alt: string | null; credit: string | null; license: string | null } | null;
  coverArt: CoverArt | null;
  isDemo: boolean;
  releases: ProfileRelease[];
  events: ProfileEvent[];
  /** Noticias publicadas en las que el artista está etiquetado. */
  news: StoryCard[];
};

/** Perfil público de un artista o banda: datos, discografía, próximas fechas y noticias etiquetadas. */
export async function getArtistProfile(db: Db, slug: string, now = new Date()): Promise<ArtistProfile | null> {
  const [row] = await db
    .select({ artist: artists, photoKey: media.storageKey, alt: media.alt, credit: media.credit, license: media.license })
    .from(artists)
    .leftJoin(media, eq(media.id, artists.photoId))
    .where(and(eq(artists.slug, slug), isNull(artists.deletedAt)))
    .limit(1);
  if (!row) return null;
  const a = row.artist;

  const [genreRows, releaseRows, eventRows, tagged] = await Promise.all([
    db
      .select({ name: genres.name })
      .from(artistGenres)
      .innerJoin(genres, eq(genres.id, artistGenres.genreId))
      .where(eq(artistGenres.artistId, a.id))
      .orderBy(asc(genres.name)),
    db
      .select({ id: releases.id, slug: releases.slug, title: releases.title, kind: releases.kind, releasedAt: releases.releasedAt, label: releases.label })
      .from(releaseArtists)
      .innerJoin(releases, eq(releases.id, releaseArtists.releaseId))
      .where(and(eq(releaseArtists.artistId, a.id), eq(releases.status, "published"), isNull(releases.deletedAt)))
      .orderBy(desc(releases.releasedAt)),
    db
      .select({
        id: events.id,
        slug: events.slug,
        name: events.name,
        kind: events.kind,
        startsAt: events.startsAt,
        city: events.city,
        country: events.country,
        venue: events.venue,
        ticketUrl: events.ticketUrl,
      })
      .from(eventArtists)
      .innerJoin(events, eq(events.id, eventArtists.eventId))
      .where(and(eq(eventArtists.artistId, a.id), eq(events.status, "published"), isNull(events.deletedAt), gte(events.startsAt, now)))
      .orderBy(asc(events.startsAt)),
    db
      .select({ id: articleEntities.articleId })
      .from(articleEntities)
      .where(and(eq(articleEntities.kind, "artist"), eq(articleEntities.entityId, a.id))),
  ]);

  return {
    id: a.id,
    slug: a.slug,
    name: a.name,
    country: a.country,
    bio: a.bio,
    genres: genreRows.map((g) => g.name),
    links: a.links,
    imageUrl: row.photoKey ? `/media/${row.photoKey}` : null,
    photoCredit: row.photoKey ? { alt: row.alt, credit: row.credit, license: row.license } : null,
    coverArt: a.coverArt,
    isDemo: a.isDemo,
    releases: releaseRows,
    events: eventRows,
    news: await listPublicArticlesByIds(db, tagged.map((t) => t.id), 12, now),
  };
}

/** Artistas o bandas etiquetados en un artículo, para mostrarlos con enlace a su perfil. */
export async function getArticleArtists(db: Db, articleId: string): Promise<{ slug: string; name: string }[]> {
  const ids = await db
    .select({ id: articleEntities.entityId })
    .from(articleEntities)
    .where(and(eq(articleEntities.articleId, articleId), eq(articleEntities.kind, "artist")));
  if (ids.length === 0) return [];
  return db
    .select({ slug: artists.slug, name: artists.name })
    .from(artists)
    .where(and(inArray(artists.id, ids.map((i) => i.id)), isNull(artists.deletedAt)))
    .orderBy(asc(artists.name));
}

/** Slugs de los perfiles públicos (para el sitemap). */
export async function listArtistSlugs(db: Db): Promise<{ slug: string; updatedAt: Date }[]> {
  return db.select({ slug: artists.slug, updatedAt: artists.updatedAt }).from(artists).where(isNull(artists.deletedAt)).orderBy(asc(artists.name));
}

export type PublicArtist = {
  slug: string;
  name: string;
  country: string | null;
  genre: string | null;
  imageUrl: string | null;
  coverArt: CoverArt | null;
  isDemo: boolean;
};

/** Todos los artistas y bandas visibles (índice público), por orden alfabético. */
export async function listPublicArtists(db: Db): Promise<PublicArtist[]> {
  const rows = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      name: artists.name,
      country: artists.country,
      coverArt: artists.coverArt,
      isDemo: artists.isDemo,
      photoKey: media.storageKey,
    })
    .from(artists)
    .leftJoin(media, eq(media.id, artists.photoId))
    .where(isNull(artists.deletedAt))
    .orderBy(asc(artists.name));
  if (rows.length === 0) return [];
  const g = await db
    .select({ artistId: artistGenres.artistId, name: genres.name })
    .from(artistGenres)
    .innerJoin(genres, eq(genres.id, artistGenres.genreId))
    .where(inArray(artistGenres.artistId, rows.map((r) => r.id)))
    .orderBy(asc(genres.name));
  const first = new Map<string, string>();
  for (const x of g) if (!first.has(x.artistId)) first.set(x.artistId, x.name);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    country: r.country,
    genre: first.get(r.id) ?? null,
    imageUrl: r.photoKey ? `/media/${r.photoKey}` : null,
    coverArt: r.coverArt,
    isDemo: r.isDemo,
  }));
}
