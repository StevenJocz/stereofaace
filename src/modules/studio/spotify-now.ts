/**
 * Lo que Spotify dice que suena ahora («Get Currently Playing Track», https://developer.spotify.com/documentation/web-api).
 * Solo lee la respuesta JSON de la API; no toca el audio. Nada de este texto llega al HTML sin escapar (React lo escapa).
 */
export type SpotifyNow = {
  /** `true` mientras Spotify reproduce; en pausa conserva la última canción. */
  playing: boolean;
  /** Spotify está pasando un anuncio (cuentas gratuitas): no hay canción que mostrar. */
  ad: boolean;
  track: { id: string | null; title: string; artist: string; kind: "track" | "episode" } | null;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim() : "");

/** Interpreta la respuesta de `GET /v1/me/player/currently-playing`. `null` si no hay nada reproduciéndose o el formato no se reconoce. */
export function parseCurrentlyPlaying(raw: unknown): SpotifyNow | null {
  const r = obj(raw);
  const type = str(r.currently_playing_type);
  const playing = r.is_playing === true;
  if (type === "ad") return { playing, ad: true, track: null };
  const item = obj(r.item);
  const title = str(item.name);
  if (!title) return null;
  const id = /^[A-Za-z0-9]{22}$/.test(str(item.id)) ? str(item.id) : null;
  if (type === "episode") {
    return { playing, ad: false, track: { id, title, artist: str(obj(item.show).name), kind: "episode" } };
  }
  const artists = Array.isArray(item.artists) ? item.artists.map((a) => str(obj(a).name)).filter(Boolean) : [];
  return { playing, ad: false, track: { id, title, artist: artists.join(", "), kind: "track" } };
}
