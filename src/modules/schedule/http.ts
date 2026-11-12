import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { localDateToUtc } from "./occurrences";
import { getNowPlaying, getSchedule } from "./public";

const CACHE = "public, max-age=0, s-maxage=30, stale-while-revalidate=30";

const bad = (message: string) => Response.json({ error: message }, { status: 400 });

export async function nowHandler(db: Db, now: Date = new Date()): Promise<Response> {
  return Response.json({ now: await getNowPlaying(db, now) }, { headers: { "cache-control": CACHE } });
}

/** `from` y `to` son fechas locales de Bogotá (AAAA-MM-DD); `to` es inclusivo. */
export async function scheduleHandler(db: Db, from: string | null, to: string | null): Promise<Response> {
  const start = from ? localDateToUtc(from) : null;
  const lastDay = to ? localDateToUtc(to) : null;
  if (!start || !lastDay) return bad("Usa fechas con el formato AAAA-MM-DD en los parámetros from y to.");
  try {
    const items = await getSchedule(db, start, new Date(lastDay.getTime() + 86_400_000));
    return Response.json({ items }, { headers: { "cache-control": CACHE } });
  } catch (error) {
    if (error instanceof DomainError) return bad(error.message);
    throw error;
  }
}
