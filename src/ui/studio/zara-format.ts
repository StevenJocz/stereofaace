/** Formatos de tiempo del estudio (estilo ZaraStudio): contador con décimas, hora de reloj y suma de duraciones. */

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** «02:12.7» (minutos:segundos.décimas); con una hora o más, «1:05:09.3». `--:--.-` si no hay dato. */
export function formatRemaining(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) return "--:--.-";
  const tenths = Math.floor(sec * 10);
  const t = Math.floor(tenths / 10);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const d = tenths % 10;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${d}` : `${pad(m)}:${pad(s)}.${d}`;
}

/** «13:47:26» en la hora de la radio (Bogotá). */
export function formatClock(ms: number): string {
  return new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Bogota" }).format(ms);
}

/** «sáb, 23 nov» en la hora de la radio. */
export function formatDayShort(ms: number): string {
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" }).format(ms).replace(/\./g, "").replace(" de ", " ");
}

/** Suma las duraciones conocidas (las pistas sin duración no cuentan). */
export function sumDurations(list: ReadonlyArray<number | null | undefined>): number {
  return list.reduce<number>((acc, d) => acc + (d && Number.isFinite(d) && d > 0 ? d : 0), 0);
}

/** Hora de fin de la pista en curso (ms) o `null` si no hay cuánto falta. */
export function endsAtMs(nowMs: number, remainingSec: number | null | undefined): number | null {
  return remainingSec === null || remainingSec === undefined || !Number.isFinite(remainingSec) || remainingSec < 0 ? null : nowMs + remainingSec * 1000;
}
