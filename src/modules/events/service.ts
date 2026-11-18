import { and, asc, eq, gte, ilike, isNull, lte, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { artists } from "@/modules/artists/schema";
import { media } from "@/modules/media/schema";
import { genres } from "@/modules/taxonomy/schema";
import { eventArtists, eventImages, events, type EventKind } from "./schema";
import { listEventsQuerySchema, type ListEventsQuery } from "./validators";

export type EventCard = {
  id: string;
  slug: string;
  name: string;
  kind: EventKind;
  startsAt: Date;
  city: string;
  country: string;
  venue: string | null;
  genre: string | null;
  ticketUrl: string | null;
  coverArt: CoverArt | null;
  /** Imagen principal (cartel o foto) si la hay; si no, se usa `coverArt`. */
  imageUrl: string | null;
  isDemo: boolean;
};

/** Próximos eventos publicados con filtros de país, ciudad, género y rango de fechas. */
export async function listUpcomingEvents(
  db: Db,
  rawQuery: Partial<ListEventsQuery> = {},
  now = new Date(),
): Promise<EventCard[]> {
  const q = listEventsQuerySchema.parse(rawQuery);
  const from = q.from && q.from > now ? q.from : now;
  const rows = await db
    .select({
      id: events.id,
      slug: events.slug,
      name: events.name,
      kind: events.kind,
      startsAt: events.startsAt,
      city: events.city,
      country: events.country,
      venue: events.venue,
      genre: genres.name,
      ticketUrl: events.ticketUrl,
      coverArt: events.coverArt,
      imageKey: media.storageKey,
      isDemo: events.isDemo,
    })
    .from(events)
    .leftJoin(genres, eq(genres.id, events.genreId))
    .leftJoin(media, eq(media.id, events.imageId))
    .where(
      and(
        eq(events.status, "published"),
        isNull(events.deletedAt),
        gte(events.startsAt, from),
        q.to ? lte(events.startsAt, q.to) : undefined,
        q.country ? eq(events.country, q.country) : undefined,
        // Los comodines del usuario se escapan para que «%» o «_» no cambien el significado del filtro.
        q.city
          ? ilike(
              events.city,
              q.city.replace(/[\\%_]/g, (c) => "\\" + c),
            )
          : undefined,
        q.genre ? eq(genres.slug, q.genre) : undefined,
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(q.limit);
  return rows.map(({ imageKey, ...r }) => ({ ...r, imageUrl: imageKey ? `/media/${imageKey}` : null }));
}

export type EventPage = EventCard & {
  endsAt: Date | null;
  description: string | null;
  genreSlug: string | null;
  imageCredit: { alt: string | null; credit: string | null; license: string | null } | null;
  gallery: { url: string; alt: string | null; credit: string | null }[];
  lineup: { name: string; slug: string; imageUrl: string | null }[];
  cancelled: boolean;
  past: boolean;
  related: EventCard[];
};

/** Ficha completa de un evento publicado (o cancelado, que se muestra como tal). Los borradores y borrados no existen. */
export async function getEventPage(db: Db, slug: string, now = new Date()): Promise<EventPage | null> {
  const [r] = await db
    .select({
      e: events,
      genre: genres.name,
      genreSlug: genres.slug,
      imageKey: media.storageKey,
      alt: media.alt,
      credit: media.credit,
      license: media.license,
    })
    .from(events)
    .leftJoin(genres, eq(genres.id, events.genreId))
    .leftJoin(media, eq(media.id, events.imageId))
    .where(and(eq(events.slug, slug), isNull(events.deletedAt), or(eq(events.status, "published"), eq(events.status, "cancelled"))));
  if (!r) return null;
  const e = r.e;
  const [gallery, lineup, related] = await Promise.all([
    db
      .select({ key: media.storageKey, alt: media.alt, credit: media.credit })
      .from(eventImages)
      .innerJoin(media, eq(media.id, eventImages.mediaId))
      .where(eq(eventImages.eventId, e.id))
      .orderBy(asc(eventImages.position)),
    db
      .select({ name: artists.name, slug: artists.slug, photoKey: media.storageKey })
      .from(eventArtists)
      .innerJoin(artists, eq(artists.id, eventArtists.artistId))
      .leftJoin(media, eq(media.id, artists.photoId))
      .where(and(eq(eventArtists.eventId, e.id), isNull(artists.deletedAt)))
      .orderBy(asc(eventArtists.position)),
    // «Más en agenda»: próximos eventos de la misma ciudad o del mismo género, sin repetir este.
    listUpcomingEvents(db, { limit: 12 }, now).then((all) => all.filter((x) => x.id !== e.id && (x.city === e.city || (r.genre && x.genre === r.genre))).slice(0, 3)),
  ]);
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    kind: e.kind,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    city: e.city,
    country: e.country,
    venue: e.venue,
    genre: r.genre,
    genreSlug: r.genreSlug,
    ticketUrl: e.ticketUrl,
    coverArt: e.coverArt,
    imageUrl: r.imageKey ? `/media/${r.imageKey}` : null,
    imageCredit: r.imageKey ? { alt: r.alt, credit: r.credit, license: r.license } : null,
    description: e.description,
    isDemo: e.isDemo,
    gallery: gallery.map((g) => ({ url: `/media/${g.key}`, alt: g.alt, credit: g.credit })),
    lineup: lineup.map((l) => ({ name: l.name, slug: l.slug, imageUrl: l.photoKey ? `/media/${l.photoKey}` : null })),
    cancelled: e.status === "cancelled",
    past: (e.endsAt ?? e.startsAt).getTime() < now.getTime(),
    related,
  };
}

/** Slugs de los eventos públicos (para el mapa del sitio). */
export async function listEventSlugs(db: Db): Promise<{ slug: string; updatedAt: Date }[]> {
  return db
    .select({ slug: events.slug, updatedAt: events.updatedAt })
    .from(events)
    .where(and(eq(events.status, "published"), isNull(events.deletedAt)))
    .orderBy(asc(events.startsAt))
    .limit(500);
}
