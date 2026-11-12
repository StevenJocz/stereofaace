import type { Db } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/rbac";
import { AzuraClient } from "@/modules/studio/azuracast";
import { readStored } from "@/modules/studio/settings";

export type FeedTrack = { title: string; artist: string; art: string | null; playedAt: string | null };
export type StationFeed = {
  nowPlaying: (FeedTrack & { durationSec: number | null }) | null;
  history: FeedTrack[];
  live: { isLive: boolean; streamer: string | null };
};
export type RecentTrack = FeedTrack & { onAir: boolean };

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function toTrack(entry: unknown): FeedTrack | null {
  const e = obj(entry);
  const song = obj(e.song);
  const title = str(song.title) || str(song.text);
  if (!title) return null;
  const art = str(song.art);
  const at = typeof e.played_at === "number" && Number.isFinite(e.played_at) ? new Date(e.played_at * 1000).toISOString() : null;
  return { title, artist: str(song.artist), art: art.startsWith("https://") ? art : null, playedAt: at };
}

/** Lee la respuesta pública `nowplaying` de AzuraCast; cualquier forma inesperada da un resultado vacío. */
export function parseFeed(raw: unknown, historyLimit = 10): StationFeed {
  const r = obj(raw);
  const np = toTrack(r.now_playing);
  const dur = obj(r.now_playing).duration;
  const history = (Array.isArray(r.song_history) ? r.song_history : []).flatMap((h) => toTrack(h) ?? []).slice(0, historyLimit);
  const live = obj(r.live);
  return {
    nowPlaying: np ? { ...np, durationSec: typeof dur === "number" && dur > 0 ? dur : null } : null,
    history,
    live: { isLive: live.is_live === true, streamer: str(live.streamer_name) || null },
  };
}

/** Lee el historial de la API con clave: de la más reciente a la más antigua. */
export function parseHistory(raw: unknown, limit: number): FeedTrack[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw.flatMap((e) => {
    const t = toTrack(e);
    return t ? [t] : [];
  });
  return rows.sort((a, b) => Date.parse(b.playedAt ?? "") - Date.parse(a.playedAt ?? "") || 0).slice(0, limit);
}

/** Qué suena y qué sonó, desde la API pública de AzuraCast (sin clave). `null` si no responde. */
export async function getStationFeed(db: Db, fetchImpl: typeof fetch = fetch): Promise<StationFeed | null> {
  const { baseUrl, stationId } = await readStored(db);
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/api/nowplaying/${encodeURIComponent(stationId)}`, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return parseFeed(await res.json());
  } catch {
    return null;
  }
}

/** Para el panel: la que suena primero y hasta `limit` en total. Con clave se llega a 10; sin ella, a las 5 que da la API pública. */
export async function getRecentTracks(db: Db, actor: Actor | null, limit = 10, fetchImpl: typeof fetch = fetch): Promise<RecentTrack[]> {
  assertCan(actor, "station:read");
  const feed = await getStationFeed(db, fetchImpl);
  const now = feed?.nowPlaying ?? null;
  let past: FeedTrack[] = feed?.history ?? [];
  const cfg = await readStored(db);
  if (cfg.apiKey) {
    try {
      const full = parseHistory(await new AzuraClient(cfg, fetchImpl).history(limit + 2), limit + 2);
      if (full.length > 0) past = full;
    } catch {
      /* se queda el historial público */
    }
  }
  const rest = past.filter((t) => !(now && t.playedAt !== null && t.playedAt === now.playedAt));
  const list: RecentTrack[] = [...(now ? [{ title: now.title, artist: now.artist, art: now.art, playedAt: now.playedAt, onAir: true }] : []), ...rest.map((t) => ({ ...t, onAir: false }))];
  return list.slice(0, limit);
}
