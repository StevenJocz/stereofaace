import { bogotaParts } from "@/modules/schedule/occurrences";
import type { PublicProgramInfo } from "@/modules/schedule/public";

const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Agrupa los tramos semanales con la misma hora: «LUN · MIÉ · VIE 10:00–12:00». */
export function groupWeekly(weekly: PublicProgramInfo["weekly"]): { days: string[]; start: string; end: string }[] {
  const out: { days: string[]; start: string; end: string }[] = [];
  for (const w of weekly) {
    const hit = out.find((g) => g.start === w.start && g.end === w.end);
    if (hit) hit.days.push(DAY_SHORT[w.weekday]);
    else out.push({ days: [DAY_SHORT[w.weekday]], start: w.start, end: w.end });
  }
  return out;
}

const hhmm = (iso: string) => {
  const p = bogotaParts(new Date(iso));
  return `${pad(Math.floor(p.minutes / 60))}:${pad(p.minutes % 60)}`;
};

/** «Hoy 20:00», «Mañana 06:00» o «Mié 18 · 20:00» (hora de Bogotá). */
export function whenLabel(iso: string, now: Date): string {
  const at = bogotaParts(new Date(iso));
  const today = bogotaParts(now);
  const tomorrow = bogotaParts(new Date(now.getTime() + 86_400_000));
  if (at.date === today.date) return `Hoy ${hhmm(iso)}`;
  if (at.date === tomorrow.date) return `Mañana ${hhmm(iso)}`;
  const day = Number(at.date.slice(8, 10));
  return `${DAY_LONG[at.weekday].slice(0, 3)} ${day} · ${hhmm(iso)}`;
}

/** Etiqueta de cinta del cartel: «AL AIRE» o la próxima emisión. */
export function tapeLabel(p: Pick<PublicProgramInfo, "onAir" | "upcoming">, now: Date): string | null {
  if (p.onAir) return "Al aire";
  return p.upcoming[0] ? `Próximo · ${whenLabel(p.upcoming[0].startsAt, now)}` : null;
}
