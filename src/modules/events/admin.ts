import { and, asc, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { uniqueSlug } from "@/lib/admin/slug";
import { slugify } from "@/lib/slug";
import { artists } from "@/modules/artists/schema";
import { recordAudit } from "@/modules/users/audit";
import { eventArtists, events, type EVENT_STATES } from "./schema";
import { eventInputSchema } from "./validators";

export const EVENT_PAGE_SIZE = 20;
export type EventRow = typeof events.$inferSelect;
type EventState = (typeof EVENT_STATES)[number];

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function setLineup(db: Db, eventId: string, artistIds: string[]) {
  await db.delete(eventArtists).where(eq(eventArtists.eventId, eventId));
  const unique = [...new Set(artistIds)];
  if (unique.length)
    await db.insert(eventArtists).values(unique.map((artistId, position) => ({ eventId, artistId, position })));
}

export async function listEventsAdmin(
  db: Db,
  actor: Actor | null,
  q: { search?: string; status?: EventState; upcoming?: boolean; includeDeleted?: boolean; page?: number } = {},
  now = new Date(),
): Promise<{ items: EventRow[]; total: number; pageSize: number }> {
  assertCan(actor, "event:read");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const term = q.search?.trim();
  const where = and(
    q.includeDeleted ? undefined : isNull(events.deletedAt),
    q.status ? eq(events.status, q.status) : undefined,
    q.upcoming ? gte(events.startsAt, now) : undefined,
    term
      ? or(
          ilike(events.name, `%${likeEscape(term)}%`),
          ilike(events.city, `%${likeEscape(term)}%`),
          ilike(events.venue, `%${likeEscape(term)}%`),
        )
      : undefined,
  );
  const [items, [{ c }]] = await Promise.all([
    db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.startsAt))
      .limit(EVENT_PAGE_SIZE)
      .offset((page - 1) * EVENT_PAGE_SIZE),
    db.select({ c: sql<number>`count(*)` }).from(events).where(where),
  ]);
  return { items, total: Number(c), pageSize: EVENT_PAGE_SIZE };
}

/** Un evento (también si está borrado) con su cartel en orden. */
export async function getEventAdmin(db: Db, actor: Actor | null, id: string) {
  assertCan(actor, "event:read");
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row) return null;
  const lineup = await db
    .select({ artistId: eventArtists.artistId })
    .from(eventArtists)
    .innerJoin(artists, eq(artists.id, eventArtists.artistId))
    .where(eq(eventArtists.eventId, id))
    .orderBy(asc(eventArtists.position));
  return { ...row, artistIds: lineup.map((l) => l.artistId) };
}

export async function createEvent(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string; slug: string }> {
  assertCan(actor, "event:create");
  const input = eventInputSchema.parse(raw);
  if (input.status !== "draft") assertCan(actor, "event:publish");
  const slug = await uniqueSlug(db, events, input.slug ?? slugify(input.name), "evento");
  const [row] = await db
    .insert(events)
    .values({
      slug,
      name: input.name,
      kind: input.kind,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      venue: input.venue,
      city: input.city,
      country: input.country,
      description: input.description,
      genreId: input.genreId,
      ticketUrl: input.ticketUrl,
      coverArt: input.coverArt,
      status: input.status,
    })
    .returning({ id: events.id, slug: events.slug });
  await setLineup(db, row.id, input.artistIds);
  await recordAudit(db, { userId: actor.id, action: "event.create", entity: "event", entityId: row.id });
  return row;
}

export async function updateEvent(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
  assertCan(actor, "event:update");
  const input = eventInputSchema.parse(raw);
  const [current] = await db.select().from(events).where(and(eq(events.id, id), isNull(events.deletedAt))).limit(1);
  if (!current) throw new DomainError("not_found", "Evento no encontrado");
  if (input.status !== current.status) assertCan(actor, "event:publish");
  await db
    .update(events)
    .set({
      name: input.name,
      slug: input.slug ? await uniqueSlug(db, events, input.slug, "evento", id) : current.slug,
      kind: input.kind,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      venue: input.venue ?? null,
      city: input.city,
      country: input.country,
      description: input.description ?? null,
      genreId: input.genreId ?? null,
      ticketUrl: input.ticketUrl ?? null,
      coverArt: input.coverArt ?? null,
      status: input.status,
    })
    .where(eq(events.id, id));
  await setLineup(db, id, input.artistIds);
  await recordAudit(db, { userId: actor.id, action: "event.update", entity: "event", entityId: id });
}

export async function setEventStatus(db: Db, actor: Actor | null, id: string, status: EventState): Promise<void> {
  assertCan(actor, "event:publish");
  const done = await db
    .update(events)
    .set({ status })
    .where(and(eq(events.id, id), isNull(events.deletedAt)))
    .returning({ id: events.id });
  if (done.length === 0) throw new DomainError("not_found", "Evento no encontrado");
  await recordAudit(db, { userId: actor.id, action: "event.status", entity: "event", entityId: id, diff: { status } });
}

/** Borrado lógico: se oculta pero se puede restaurar. */
export async function deleteEvent(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "event:delete");
  const done = await db
    .update(events)
    .set({ deletedAt: new Date() })
    .where(and(eq(events.id, id), isNull(events.deletedAt)))
    .returning({ id: events.id });
  if (done.length === 0) throw new DomainError("not_found", "Evento no encontrado");
  await recordAudit(db, { userId: actor.id, action: "event.delete", entity: "event", entityId: id });
}

export async function restoreEvent(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "event:delete");
  const done = await db.update(events).set({ deletedAt: null }).where(eq(events.id, id)).returning({ id: events.id });
  if (done.length === 0) throw new DomainError("not_found", "Evento no encontrado");
  await recordAudit(db, { userId: actor.id, action: "event.restore", entity: "event", entityId: id });
}
