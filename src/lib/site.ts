import { formatShortDate } from "./time";

/** Número de edición (fijo hasta que exista el módulo de ediciones). */
export const EDITION_NO = "0001";

/** Fecha de edición en formato de franja: «10 / NOV / 2026». Requiere `now` explícito (no usa el reloj). */
export function editionDate(now: Date): string {
  return formatShortDate(now).replaceAll("/", " / ").toUpperCase();
}

/** URL pública base (canónicas, Open Graph, JSON-LD). Configurable con NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
