import type { Db } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { loadRelayUrl } from "./relay";

export type RelayTrack = { title: string; artist: string; img: string | null; next: string | null };

const MOUNT = /^[a-z0-9_-]{1,40}$/i;

/** myradio24 publica un JSON de estado por emisora; para otras señales no hay uno conocido. */
export function statusUrlFor(streamUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(streamUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)myradio24\.(org|com)$/i.test(u.hostname)) return null;
  const mount = u.pathname.split("/").filter(Boolean)[0] ?? "";
  return MOUNT.test(mount) ? `https://myradio24.com/users/${mount.toLowerCase()}/status.json` : null;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseRelayStatus(raw: unknown): RelayTrack | null {
  const r = obj(raw);
  const song = str(r.song);
  if (!song) return null;
  const title = str(r.songtitle) || song;
  const img = str(r.img);
  const imgUrl = img ? (img.startsWith("https://") ? img : /^[\w./-]+$/.test(img) ? `https://myradio24.com/${img.replace(/^\/+/, "")}` : null) : null;
  const first = obj(Array.isArray(r.nextsongs) ? r.nextsongs[0] : null);
  return { title, artist: str(r.artist), img: imgUrl, next: str(first.song) || null };
}

/** Qué suena ahora en la señal externa. `null` si no hay señal, no hay JSON conocido o no responde. */
export async function getRelayNowPlaying(db: Db, actor: Actor | null, fetchImpl: typeof fetch = fetch): Promise<RelayTrack | null> {
  const url = await loadRelayUrl(db, actor);
  const status = url ? statusUrlFor(url) : null;
  if (!status) return null;
  try {
    const res = await fetchImpl(status, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { "user-agent": "StereoFace-Relay/1.0" } });
    if (!res.ok) return null;
    return parseRelayStatus(await res.json());
  } catch {
    return null;
  }
}
