/**
 * Programador de eventos del estudio: decisiones puras (sin DOM ni reloj propio) sobre qué evento toca, a qué hora y cuál sigue.
 * Todo en la hora de la radio (Bogotá, UTC−5 fijo). Los eventos guardan la hora como minutos desde la medianoche y los días en ISO
 * (1 lunes … 7 domingo).
 */
import { bogotaParts } from "@/modules/schedule/occurrences";
import type { CartView } from "@/modules/studio/carts";
import type { EventItem, EventMode, EventTransition } from "@/modules/studio/schema";
import type { QueueItem } from "./queue";

export type SchedEvent = {
  id: string;
  name: string;
  minuteOfDay: number;
  days: number[];
  mode: EventMode;
  transition: EventTransition;
  active: boolean;
  items: EventItem[];
};

export type Occurrence = { event: SchedEvent; /** Instante exacto (ms UTC). */ atMs: number; /** Clave única por evento y día, para no repetirlo. */ key: string };

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;
const OFFSET_MS = 5 * 3_600_000; // Bogotá = UTC−5 todo el año

/** Cuánto después de su hora todavía se dispara un evento (por si la consola abrió o se despertó tarde). Pasado esto, ese día se omite. */
export const GRACE_MS: Record<EventMode, number> = { fixed: 90_000, delayed: 5 * MIN_MS };

/** Medianoche local (Bogotá) del día de `ms`, en ms UTC. */
export function bogotaMidnight(ms: number): number {
  return Math.floor((ms - OFFSET_MS) / DAY_MS) * DAY_MS + OFFSET_MS;
}

/** Día de la semana ISO (1 lunes … 7 domingo) en Bogotá. */
export function isoWeekday(ms: number): number {
  const w = bogotaParts(new Date(ms)).weekday;
  return w === 0 ? 7 : w;
}

const dateOf = (ms: number) => bogotaParts(new Date(ms)).date;

/** Ocurrencias del día local de `ms` (solo eventos activos que corren ese día), por hora. */
export function occurrencesOfDay(events: SchedEvent[], ms: number): Occurrence[] {
  const midnight = bogotaMidnight(ms);
  const wd = isoWeekday(ms);
  const date = dateOf(ms);
  return events
    .filter((e) => e.active && e.days.includes(wd))
    .map((event) => ({ event, atMs: midnight + event.minuteOfDay * MIN_MS, key: `${event.id}:${date}` }))
    .sort((a, b) => a.atMs - b.atMs || a.event.name.localeCompare(b.event.name));
}

/** Eventos de hoy para mostrarlos todos (también los desactivados, que se ven apagados): orden por hora. */
export function todaysEvents(events: SchedEvent[], ms: number): Occurrence[] {
  const midnight = bogotaMidnight(ms);
  const wd = isoWeekday(ms);
  const date = dateOf(ms);
  return events
    .filter((e) => e.days.includes(wd))
    .map((event) => ({ event, atMs: midnight + event.minuteOfDay * MIN_MS, key: `${event.id}:${date}` }))
    .sort((a, b) => a.atMs - b.atMs || a.event.name.localeCompare(b.event.name));
}

/** El próximo evento que va a correr: hoy si queda alguno por delante; si no, el primero de los próximos 7 días. */
export function nextOccurrence(events: SchedEvent[], ms: number): Occurrence | null {
  for (let d = 0; d <= 7; d++) {
    const day = ms + d * DAY_MS;
    const found = occurrencesOfDay(events, day).find((o) => o.atMs > ms);
    if (found) return found;
  }
  return null;
}

/**
 * Eventos que ya les toca: su hora pasó (`atMs <= ahora`), están dentro de su margen y no se dispararon hoy.
 * Salen por hora, así los que coinciden suenan en el orden de su horario.
 */
export function dueOccurrences(events: SchedEvent[], nowMs: number, fired: ReadonlySet<string>): Occurrence[] {
  return occurrencesOfDay(events, nowMs).filter((o) => o.atMs <= nowMs && nowMs - o.atMs <= GRACE_MS[o.event.mode] && !fired.has(o.key));
}

/** Duración total conocida de los audios de un evento (los que no tienen duración no cuentan). */
export function eventDurationSec(items: EventItem[]): number {
  return items.reduce((acc, i) => acc + (i.durationSec && Number.isFinite(i.durationSec) && i.durationSec > 0 ? i.durationSec : 0), 0);
}

/**
 * Convierte los audios de un evento en pistas de la cola. Un cart que ya no existe en el Cart Wall se omite y se informa por nombre;
 * las pistas de la biblioteca van por su URL de AzuraCast.
 */
export function eventToQueue(items: EventItem[], carts: ReadonlyArray<Pick<CartView, "id" | "name" | "durationSec">>, makeId: () => string): { items: QueueItem[]; missing: string[] } {
  const byId = new Map(carts.map((c) => [c.id, c]));
  const out: QueueItem[] = [];
  const missing: string[] = [];
  for (const i of items) {
    if (i.kind === "file") {
      out.push({ id: makeId(), file: null, url: `/api/studio/file/${i.azId}`, title: i.title, artist: i.artist, durationSec: i.durationSec, source: "azuracast" });
      continue;
    }
    const c = byId.get(i.cartId);
    if (!c) {
      missing.push(i.name);
      continue;
    }
    out.push({ id: makeId(), file: null, url: `/api/studio/cart/${c.id}`, title: c.name, artist: "", durationSec: c.durationSec, source: "cart" });
  }
  return { items: out, missing };
}

/**
 * Qué hacer con la consola cuando dispara un evento:
 *  - `start`: no suena nada → arranca el bloque ya.
 *  - `skip-cut` / `skip-fade`: evento Fijo con algo sonando → salta a su primer audio (en seco o con fundido).
 *  - `wait`: evento Retardado con algo sonando → queda al frente de la lista y entra al terminar la pista (o al empezar su fundido).
 */
export function eventAction(input: { mode: EventMode; transition: EventTransition; playing: boolean }): "start" | "skip-cut" | "skip-fade" | "wait" {
  if (!input.playing) return "start";
  if (input.mode === "delayed") return "wait";
  return input.transition === "cut" ? "skip-cut" : "skip-fade";
}
