import { and, asc, eq, gte, ilike, isNull, lte } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { CoverArt } from "@/modules/media/cover-art";
import { genres } from "@/modules/taxonomy/schema";
import { events, type EventKind } from "./schema";
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
      isDemo: events.isDemo,
    })
    .from(events)
    .leftJoin(genres, eq(genres.id, events.genreId))
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
  return rows;
}
