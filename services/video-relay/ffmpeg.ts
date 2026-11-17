/** Piezas puras del relay (sin procesos ni red): argumentos de FFmpeg, validación del destino y redacción de claves. */

export const RTSP_SOURCE = "rtsp://mediamtx:8554/cabina";

/** Solo se acepta RTMP(S) hacia servidores de YouTube: el relay no es un reenviador genérico. */
export function validateIngestUrl(raw: unknown): URL {
  if (typeof raw !== "string" || raw.length > 400) throw new Error("destino no válido");
  const u = new URL(raw);
  if (u.protocol !== "rtmp:" && u.protocol !== "rtmps:") throw new Error("destino no válido");
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) throw new Error("destino no permitido");
  if (u.username || u.password || u.pathname.split("/").filter(Boolean).length < 2) throw new Error("destino no válido");
  return u;
}

/**
 * FFmpeg: video de la cabina (RTSP interno de MediaMTX) + una pista AAC SILENCIOSA que YouTube exige.
 * `-map 0:v:0` toma solo el video de la cámara; el audio de la entrada nunca se mapea, así que no puede salir al aire.
 */
export function buildArgs(ingestUrl: string, source = RTSP_SOURCE): string[] {
  return [
    "-hide_banner", "-loglevel", "warning", "-nostdin",
    "-rtsp_transport", "tcp", "-i", source,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-r", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-b:v", "2500k", "-maxrate", "2500k", "-bufsize", "5000k",
    "-c:a", "aac", "-b:a", "64k", "-ar", "44100", "-ac", "2",
    "-f", "flv", ingestUrl,
  ];
}

/** Borra de un texto la dirección de entrada y la clave de transmisión. */
export function redact(text: string, ingestUrl: string | null): string {
  if (!ingestUrl) return text;
  const key = ingestUrl.split("/").filter(Boolean).pop() ?? "";
  let out = text.split(ingestUrl).join("rtmp://***");
  if (key.length >= 4) out = out.split(key).join("***");
  return out;
}
