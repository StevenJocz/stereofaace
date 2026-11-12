export type AirLevel = "ok" | "warn" | "urgent";

const pad = (n: number) => String(n).padStart(2, "0");

/** HH:MM:SS; los milisegundos sobrantes se descartan (un segundo solo cuenta cuando ya pasó entero). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Tiempo que le queda al DJ al aire según el fin de su programa. `null` si no hay hora de fin. */
export function airTimeLeft(endsAtMs: number | null, nowMs: number): { text: string; level: AirLevel; ended: boolean } | null {
  if (endsAtMs === null) return null;
  const left = endsAtMs - nowMs;
  const level: AirLevel = left <= 60_000 ? "urgent" : left <= 5 * 60_000 ? "warn" : "ok";
  return { text: formatClock(left), level, ended: left <= 0 };
}
