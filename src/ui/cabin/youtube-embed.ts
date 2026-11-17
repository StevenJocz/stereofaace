/** Dirección del embed oficial de YouTube: SIEMPRE mudo (el audio del sitio es solo el de la radio) y sin controles. */
export function cabinEmbedSrc(videoId: string): string | null {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
  const q = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    disablekb: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    fs: "0",
    enablejsapi: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${q}`;
}

/** Orden de silenciar para el reproductor de YouTube (API por postMessage, sin cargar ningún script externo). */
export const MUTE_COMMAND = JSON.stringify({ event: "command", func: "mute", args: [] });
export const YT_ORIGIN = "https://www.youtube-nocookie.com";
