const MONTHS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** «Hace 5 min», «Hace 2 horas», «Ayer», «Hace 3 días», o fecha corta si es más antiguo. */
export function timeAgoEs(date: Date, now: Date = new Date()): string {
  const s = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "Hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Ayer";
  if (d < 7) return `Hace ${d} días`;
  return formatShortDate(date);
}

/** «10/Nov/2026» */
export function formatShortDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}`;
}

/** «10/Nov» */
export function formatDayMonth(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")}/${MONTHS[date.getUTCMonth()]}`;
}

const BOGOTA_DAY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Bogota",
  month: "numeric",
  day: "numeric",
});

/**
 * «NOV 21» (estilo ficha de agenda). El día es el de Bogotá: los eventos se cargan en hora de Bogotá (UTC−5),
 * así que con getters UTC uno a las 21:00 saltaría al día siguiente.
 */
export function formatAgendaDate(date: Date): string {
  const parts = BOGOTA_DAY.formatToParts(date);
  const month = Number(parts.find((p) => p.type === "month")?.value) - 1;
  const day = parts.find((p) => p.type === "day")?.value ?? "1";
  return `${MONTHS[month].toUpperCase()} ${day.padStart(2, "0")}`;
}
