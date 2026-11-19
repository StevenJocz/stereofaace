/** Estados del reproductor de YouTube (API de mensajes del iframe). */
export const YT_ENDED = 0;
export const YT_PLAYING = 1;

/** Lee el estado del reproductor desde un mensaje del iframe de YouTube (`onStateChange` o `infoDelivery`); `null` si no es de estado. */
export function playerStateOf(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.length > 4000) return null;
  let d: { event?: unknown; info?: unknown };
  try {
    d = JSON.parse(raw) as typeof d;
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  if (d.event === "onStateChange" && typeof d.info === "number") return d.info;
  if (d.event === "infoDelivery" && d.info && typeof d.info === "object") {
    const s = (d.info as { playerState?: unknown }).playerState;
    return typeof s === "number" ? s : null;
  }
  return null;
}
