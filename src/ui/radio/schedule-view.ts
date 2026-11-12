/** Utilidades puras de la vista de programación (zona America/Bogota, UTC−5 fijo). */
import { bogotaParts, localDateToUtc } from "@/modules/schedule/occurrences";

const DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

type Timed = { startsAt: string; endsAt: string };

const hhmm = (iso: string) => {
  const p = bogotaParts(new Date(iso));
  return `${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
};

export const formatRange = (startsAt: string, endsAt: string) => `${hhmm(startsAt)}–${hhmm(endsAt)}`;

export function todayBogota(now: Date = new Date()): string {
  return bogotaParts(now).date;
}

/** «lunes 16 de noviembre» a partir de una fecha local YYYY-MM-DD. */
export function dayLabel(date: string): string {
  const d = localDateToUtc(date);
  if (!d) return date;
  const p = bogotaParts(d);
  const [, m, day] = date.split("-").map(Number);
  return `${DAYS[p.weekday]} ${day} de ${MONTHS[m - 1]}`;
}

export function addDays(date: string, n: number): string {
  const d = localDateToUtc(date);
  return d ? bogotaParts(new Date(d.getTime() + n * DAY_MS)).date : date;
}

/** Agrupa por día de Bogotá y ordena por hora de inicio. */
export function groupByDay<T extends Timed>(items: T[]): { date: string; label: string; items: T[] }[] {
  const days = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const date = bogotaParts(new Date(it.startsAt)).date;
    days.set(date, [...(days.get(date) ?? []), it]);
  }
  return [...days.entries()].map(([date, list]) => ({ date, label: dayLabel(date), items: list }));
}

/** Cuadrícula del mes con semanas completas, lunes primero. */
export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = `${year}-${pad(month)}-01`;
  const lead = (bogotaParts(localDateToUtc(first) ?? new Date()).weekday + 6) % 7; // lunes = 0
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const date = addDays(first, i - lead);
    return { date, inMonth: date.startsWith(`${year}-${pad(month)}-`) };
  });
}

export type ScheduleView = "today" | "week" | "month";

/** Rango de fechas locales (inclusivo) que hay que pedir a la API para cada vista. */
export function rangeFor(view: ScheduleView, anchor: string): { from: string; to: string } {
  if (view === "today") return { from: anchor, to: anchor };
  if (view === "week") {
    const wd = (bogotaParts(localDateToUtc(anchor) ?? new Date()).weekday + 6) % 7;
    const from = addDays(anchor, -wd);
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = anchor.split("-").map(Number);
  const grid = monthGrid(y, m);
  return { from: grid[0].date, to: grid[grid.length - 1].date };
}
