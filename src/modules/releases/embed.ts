import { parseSpotify, parseYouTube, spotifyEmbedSrc, youtubeEmbedSrc, safeUrl } from "@/modules/spaces/design";
import { EMBED_HOSTS } from "./validators";

export type ReleaseEmbed =
  | { kind: "frame"; src: string; provider: string; title: string; height?: number; ratio?: string }
  | { kind: "link"; href: string; provider: string };

const ALL_SPOTIFY = ["album", "track", "playlist", "artist", "show", "episode"] as const;

/**
 * Convierte el enlace oficial guardado en un lanzamiento en un reproductor incrustable. El `src` del iframe se construye siempre
 * desde partes validadas (ids o rutas del proveedor), nunca copiando el texto tal cual; lo que no se puede incrustar de forma
 * segura se ofrece como enlace.
 */
export function releaseEmbed(raw: string | null | undefined, title: string): ReleaseEmbed | null {
  if (!raw) return null;
  const href = safeUrl(raw.trim(), [...EMBED_HOSTS]);
  if (!href) return null;
  const u = new URL(href);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "open.spotify.com") {
    const ref = parseSpotify(href, [...ALL_SPOTIFY]);
    const src = ref ? spotifyEmbedSrc(ref) : null;
    if (!ref || !src) return { kind: "link", href, provider: "Spotify" };
    return { kind: "frame", src, provider: "Spotify", title: `${title} en Spotify`, height: ref.kind === "track" || ref.kind === "episode" ? 152 : 352 };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const id = parseYouTube(href) ?? (host === "youtube-nocookie.com" ? u.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/)?.[1] : undefined);
    return id ? { kind: "frame", src: youtubeEmbedSrc(id), provider: "YouTube", title: `${title} en YouTube`, ratio: "16 / 9" } : { kind: "link", href, provider: "YouTube" };
  }
  if (host === "soundcloud.com" || host === "w.soundcloud.com") {
    const src = host === "w.soundcloud.com" ? href : `https://w.soundcloud.com/player/?url=${encodeURIComponent(href)}&hide_related=true`;
    return { kind: "frame", src, provider: "SoundCloud", title: `${title} en SoundCloud`, height: u.searchParams.get("visual") === "true" ? 300 : 166 };
  }
  if (host === "music.apple.com" || host === "embed.music.apple.com") {
    return { kind: "frame", src: `https://embed.music.apple.com${u.pathname}`, provider: "Apple Music", title: `${title} en Apple Music`, height: 450 };
  }
  if (host === "mixcloud.com") {
    const src = u.pathname.startsWith("/widget/iframe") ? href : `https://www.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(u.pathname)}&hide_cover=1`;
    return { kind: "frame", src, provider: "Mixcloud", title: `${title} en Mixcloud`, height: 120 };
  }
  if (host.endsWith("bandcamp.com")) {
    return /^\/EmbeddedPlayer\//i.test(u.pathname) ? { kind: "frame", src: href, provider: "Bandcamp", title: `${title} en Bandcamp`, height: 120 } : { kind: "link", href, provider: "Bandcamp" };
  }
  return { kind: "link", href, provider: host };
}
