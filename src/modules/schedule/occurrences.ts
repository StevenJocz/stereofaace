/**
 * Parrilla de StereoFace Radio: expansión de tramos semanales y puntuales a ocurrencias con fecha.
 * Zona horaria fija America/Bogota (UTC−5 todo el año, sin horario de verano). Aritmética pura de minutos.
 */

const OFFSET_MIN = -300; // Bogotá respecto a UTC
const DAY_MS = 86_400_000;

export type Slot = {
  id: string;
  programId: string;
  kind: "weekly" | "once";
  /** 0 = domingo … 6 = sábado (solo `weekly`). */
  weekday: number | null;
  /** YYYY-MM-DD en hora de Bogotá (solo `once`). */
  date: string | null;
  /** HH:MM locales de Bogotá. */
  start: string;
  end: string;
};

export type Occurrence = {
  slotId: string;
  programId: string;
  kind: "weekly" | "once";
  startsAt: Date;
  endsAt: Date;
};

const pad = (n: number) => String(n).padStart(2, "0");

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** Fecha local de Bogotá (YYYY-MM-DD), día de la semana y minutos desde la medianoche local. */
export function bogotaParts(d: Date): { date: string; weekday: number; minutes: number } {
  const local = new Date(d.getTime() + OFFSET_MIN * 60_000);
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    weekday: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** Instante UTC de «medianoche local» + `minutes`, para una fecha local YYYY-MM-DD. */
function localToUtc(date: string, minutes: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, minutes) - OFFSET_MIN * 60_000;
}

type Raw = { slotId: string; programId: string; kind: "weekly" | "once"; start: number; end: number; order: number };

function expand(slots: Slot[], fromMs: number, toMs: number): Raw[] {
  const out: Raw[] = [];
  const firstDay = bogotaParts(new Date(fromMs - DAY_MS)).date; // un día antes: tramos que cruzan la medianoche
  const lastDay = bogotaParts(new Date(toMs)).date;
  const days: { date: string; weekday: number }[] = [];
  for (let t = localToUtc(firstDay, 0); t <= localToUtc(lastDay, 0); t += DAY_MS) {
    const p = bogotaParts(new Date(t));
    days.push({ date: p.date, weekday: p.weekday });
  }
  slots.forEach((slot, order) => {
    const s = minutesOf(slot.start);
    const e = minutesOf(slot.end);
    if (s === null || e === null || s === e) return; // tramo vacío o mal formado
    for (const day of days) {
      if (slot.kind === "weekly" ? slot.weekday !== day.weekday : slot.date !== day.date) continue;
      const start = localToUtc(day.date, s);
      const end = e > s ? localToUtc(day.date, e) : localToUtc(day.date, e) + DAY_MS; // cruza la medianoche
      if (end > fromMs && start < toMs) out.push({ slotId: slot.id, programId: slot.programId, kind: slot.kind, start, end, order });
    }
  });
  return out;
}

/**
 * Ocurrencias que tocan [from, to), ordenadas por inicio. Si dos se solapan, gana el puntual sobre el semanal
 * y, entre iguales, el que empieza más tarde; la que pierde queda recortada o partida.
 */
export function occurrencesBetween(slots: Slot[], from: Date, to: Date): Occurrence[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs <= fromMs) return [];
  const raws = expand(slots, fromMs, toMs);
  if (raws.length === 0) return [];

  const bounds = [...new Set(raws.flatMap((r) => [r.start, r.end]))].sort((a, b) => a - b);
  const pieces: { raw: Raw; start: number; end: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const [a, b] = [bounds[i], bounds[i + 1]];
    const covering = raws.filter((r) => r.start <= a && r.end >= b);
    if (covering.length === 0) continue;
    const winner = covering.reduce((best, r) => {
      if (r.kind !== best.kind) return r.kind === "once" ? r : best;
      if (r.start !== best.start) return r.start > best.start ? r : best;
      return r.order > best.order ? r : best;
    });
    const last = pieces[pieces.length - 1];
    if (last && last.raw === winner && last.end === a) last.end = b; // une tramos contiguos de la misma ocurrencia
    else pieces.push({ raw: winner, start: a, end: b });
  }
  return pieces
    .filter((p) => p.end > fromMs && p.start < toMs)
    .map((p) => ({ slotId: p.raw.slotId, programId: p.raw.programId, kind: p.raw.kind, startsAt: new Date(p.start), endsAt: new Date(p.end) }));
}

export function currentOccurrence(slots: Slot[], now: Date): Occurrence | null {
  const n = now.getTime();
  // Ventana amplia: los horarios puntuales vecinos recortan el tramo vigente y deben contarse para que sus límites sean los reales.
  return occurrencesBetween(slots, new Date(n - 86_400_000), new Date(n + 86_400_000)).find((o) => o.startsAt.getTime() <= n && o.endsAt.getTime() > n) ?? null;
}

/** Medianoche local de Bogotá de una fecha YYYY-MM-DD (null si no es una fecha real). */
export function localDateToUtc(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(localToUtc(date, 0));
  return Number.isNaN(d.getTime()) || bogotaParts(d).date !== date ? null : d;
}

