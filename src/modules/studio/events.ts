import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, assertCan, can, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { EVENT_MODES, EVENT_TRANSITIONS, studioCarts, studioEvents, type EventItem, type EventMode, type EventTransition } from "./schema";

export type { EventItem, EventMode, EventTransition };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENTS = 200;
const MAX_ITEMS = 50;

const cartItem = z.object({ kind: z.literal("cart"), cartId: z.string().regex(UUID, "Jingle no válido") });
const fileItem = z.object({
  kind: z.literal("file"),
  azId: z.string().regex(/^\d{1,9}$/, "Pista de la biblioteca no válida"),
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200).default(""),
  durationSec: z.number().nonnegative().max(86_400).nullable().default(null),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "La hora debe ser HH:MM (24 horas)");

export const eventInputSchema = z.object({
  name: z.string().trim().min(1, "Escribe un nombre para el evento").max(80, "El nombre admite hasta 80 caracteres"),
  time: timeSchema,
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Elige al menos un día")
    .max(7)
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  mode: z.enum(EVENT_MODES).default("delayed"),
  transition: z.enum(EVENT_TRANSITIONS).default("fade"),
  active: z.boolean().default(true),
  items: z.array(z.discriminatedUnion("kind", [cartItem, fileItem])).min(1, "Añade al menos un audio al evento").max(MAX_ITEMS, `Un evento admite hasta ${MAX_ITEMS} audios`),
});
export type EventInput = z.input<typeof eventInputSchema>;

export type EventView = {
  id: string;
  name: string;
  time: string;
  minuteOfDay: number;
  days: number[];
  mode: EventMode;
  transition: EventTransition;
  active: boolean;
  items: EventItem[];
  /** El evento lo creó quien consulta. */
  mine: boolean;
  /** Quien consulta puede cambiarlo o borrarlo (su autor o quien gestiona la emisora). */
  canEdit: boolean;
};

export const minuteToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const timeToMinute = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const view = (r: typeof studioEvents.$inferSelect, actor: Actor): EventView => ({
  id: r.id,
  name: r.name,
  time: minuteToTime(r.minuteOfDay),
  minuteOfDay: r.minuteOfDay,
  days: r.days,
  mode: r.mode === "fixed" ? "fixed" : "delayed",
  transition: r.transition === "cut" ? "cut" : "fade",
  active: r.active,
  items: r.items,
  mine: r.createdBy === actor.id,
  canEdit: r.createdBy === actor.id || can(actor.role, "station:manage"),
});

/** Solo su autor o quien gestiona la emisora (`station:manage`) cambia o borra un evento: son de toda la emisora. */
function assertEditable(actor: Actor, row: typeof studioEvents.$inferSelect) {
  if (row.createdBy !== actor.id && !can(actor.role, "station:manage")) throw new ForbiddenError("station:manage");
}

async function load(db: Db, id: string) {
  if (!UUID.test(id)) throw new DomainError("event_not_found", "Ese evento ya no existe.");
  const [row] = await db.select().from(studioEvents).where(eq(studioEvents.id, id));
  if (!row) throw new DomainError("event_not_found", "Ese evento ya no existe.");
  return row;
}

/** Los carts de un evento se leen de la base (nombre y duración vigentes) y deben existir. */
async function resolveItems(db: Db, items: z.output<typeof eventInputSchema>["items"]): Promise<EventItem[]> {
  const ids = [...new Set(items.flatMap((i) => (i.kind === "cart" ? [i.cartId] : [])))];
  const carts = ids.length ? await db.select().from(studioCarts).where(and(inArray(studioCarts.id, ids), isNull(studioCarts.deletedAt))) : [];
  const byId = new Map(carts.map((c) => [c.id, c]));
  return items.map((i): EventItem => {
    if (i.kind === "file") return { kind: "file", azId: i.azId, title: i.title, artist: i.artist, durationSec: i.durationSec };
    const c = byId.get(i.cartId);
    if (!c) throw new DomainError("event_cart_missing", "Uno de los jingles del evento ya no existe. Quítalo y vuelve a guardar.");
    return { kind: "cart", cartId: c.id, name: c.name, durationSec: c.durationSec };
  });
}

export async function listEvents(db: Db, actor: Actor | null): Promise<EventView[]> {
  assertCan(actor, "studio:update");
  const rows = await db.select().from(studioEvents).orderBy(asc(studioEvents.minuteOfDay), asc(studioEvents.createdAt));
  return rows.map((r) => view(r, actor));
}

export async function createEvent(db: Db, actor: Actor | null, raw: EventInput): Promise<EventView> {
  assertCan(actor, "studio:update");
  const input = eventInputSchema.parse(raw);
  const [{ n }] = await db.select({ n: count() }).from(studioEvents);
  if (n >= MAX_EVENTS) throw new DomainError("event_limit", `Hay demasiados eventos (máximo ${MAX_EVENTS}). Borra alguno antes de crear otro.`);
  const items = await resolveItems(db, input.items);
  const [row] = await db
    .insert(studioEvents)
    .values({ name: input.name, minuteOfDay: timeToMinute(input.time), days: input.days, mode: input.mode, transition: input.transition, active: input.active, items, createdBy: actor.id })
    .returning();
  await recordAudit(db, { userId: actor.id, action: "studio.event.create", entity: "studio_event", entityId: row.id, diff: { time: input.time, mode: input.mode, items: items.length } });
  return view(row, actor);
}

export async function updateEvent(db: Db, actor: Actor | null, id: string, raw: EventInput): Promise<EventView> {
  assertCan(actor, "studio:update");
  const row = await load(db, id);
  assertEditable(actor, row);
  const input = eventInputSchema.parse(raw);
  const items = await resolveItems(db, input.items);
  const [next] = await db
    .update(studioEvents)
    .set({ name: input.name, minuteOfDay: timeToMinute(input.time), days: input.days, mode: input.mode, transition: input.transition, active: input.active, items })
    .where(eq(studioEvents.id, row.id))
    .returning();
  await recordAudit(db, { userId: actor.id, action: "studio.event.update", entity: "studio_event", entityId: row.id, diff: { time: input.time, mode: input.mode, active: input.active, items: items.length } });
  return view(next, actor);
}

export async function deleteEvent(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "studio:update");
  const row = await load(db, id);
  assertEditable(actor, row);
  await db.delete(studioEvents).where(eq(studioEvents.id, row.id));
  await recordAudit(db, { userId: actor.id, action: "studio.event.delete", entity: "studio_event", entityId: row.id });
}

/* ───────────── Anuncios de la hora ───────────── */

/** Los eventos de los anuncios de la hora se llaman «Hora · HH:MM»: así se reconocen para actualizarlos o quitarlos en bloque. */
export const HOUR_EVENT_PREFIX = "Hora · ";
const HOUR_NAME = /^Hora · ([01]\d|2[0-3]):([0-5]\d)$/;
const hourName = (hour: number, minute: number) => `${HOUR_EVENT_PREFIX}${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

export const hoursInputSchema = z.object({
  mode: z.enum(EVENT_MODES).default("delayed"),
  transition: z.enum(EVENT_TRANSITIONS).default("fade"),
  /** Minuto de cada hora en que entra el anuncio (0 = en punto). */
  minute: z.number().int().min(0).max(59).default(0),
  days: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Elige al menos un día")
    .max(7)
    .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
  hours: z
    .array(z.object({ hour: z.number().int().min(0).max(23), cartId: z.string().regex(UUID, "Jingle no válido").nullable() }))
    .max(24)
    .refine((h) => new Set(h.map((x) => x.hour)).size === h.length, "Hay una hora repetida"),
});
export type HoursInput = z.input<typeof hoursInputSchema>;
export type HoursResult = { created: number; updated: number; removed: number; skipped: string[] };

/**
 * Crea, actualiza o quita de una vez los eventos de «la hora»: por cada hora con un audio asignado hay un evento «Hora · HH:MM»
 * con ese jingle; las horas sin audio pierden su evento. Los eventos que creó otra persona y que quien guarda no puede cambiar
 * se dejan como están y se avisan en `skipped`.
 */
export async function saveHourEvents(db: Db, actor: Actor | null, raw: HoursInput): Promise<HoursResult> {
  assertCan(actor, "studio:update");
  const input = hoursInputSchema.parse(raw);
  const result: HoursResult = { created: 0, updated: 0, removed: 0, skipped: [] };
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(studioEvents).orderBy(asc(studioEvents.createdAt));
    const byHour = new Map<number, typeof studioEvents.$inferSelect>();
    for (const r of rows) {
      const m = HOUR_NAME.exec(r.name);
      if (m && !byHour.has(Number(m[1]))) byHour.set(Number(m[1]), r);
    }
    const [{ n }] = await tx.select({ n: count() }).from(studioEvents);
    let total = n;
    for (const { hour, cartId } of input.hours) {
      const existing = byHour.get(hour);
      const name = hourName(hour, input.minute);
      if (!cartId) {
        if (!existing) continue;
        if (existing.createdBy !== actor.id && !can(actor.role, "station:manage")) {
          result.skipped.push(existing.name);
          continue;
        }
        await tx.delete(studioEvents).where(eq(studioEvents.id, existing.id));
        result.removed++;
        total--;
        continue;
      }
      const items = await resolveItems(tx as unknown as Db, [{ kind: "cart", cartId }]);
      const values = { name, minuteOfDay: hour * 60 + input.minute, days: input.days, mode: input.mode, transition: input.transition, active: true, items };
      if (existing) {
        if (existing.createdBy !== actor.id && !can(actor.role, "station:manage")) {
          result.skipped.push(existing.name);
          continue;
        }
        await tx.update(studioEvents).set(values).where(eq(studioEvents.id, existing.id));
        result.updated++;
      } else {
        if (total >= MAX_EVENTS) throw new DomainError("event_limit", `Hay demasiados eventos (máximo ${MAX_EVENTS}). Borra alguno antes de crear más.`);
        await tx.insert(studioEvents).values({ ...values, createdBy: actor.id });
        result.created++;
        total++;
      }
    }
  });
  await recordAudit(db, { userId: actor.id, action: "studio.event.hours", entity: "studio_event", diff: { created: result.created, updated: result.updated, removed: result.removed, skipped: result.skipped.length } });
  return result;
}
