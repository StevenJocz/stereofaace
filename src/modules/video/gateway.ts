import { DomainError } from "@/lib/errors";

/** Sala única de LiveKit donde publica la cámara de la cabina. */
export const ROOM = "cabina";

export type EgressState = "starting" | "active" | "ending" | "ended" | "failed";

/**
 * Plano de medios (LiveKit Cloud): el navegador publica allí el video y LiveKit lo empuja a YouTube por RTMP.
 * Nuestro servidor solo hace llamadas HTTPS de SALIDA: no hace falta IP pública ni puertos abiertos.
 */
export interface MediaGateway {
  /** Token de un solo uso y vida corta para publicar SOLO la cámara (sin micrófono ni datos). */
  mintPublishToken(identity: string, name: string): Promise<{ url: string; token: string }>;
  ensureRoom(): Promise<void>;
  /** ¿Hay alguien publicando video en la sala? */
  publisherLive(): Promise<boolean>;
  /** Empuja el video de la sala a YouTube. `ingestUrl` lleva la clave: solo viaja servidor → LiveKit. Devuelve el id del egreso. */
  startEgress(ingestUrl: string): Promise<string>;
  egressState(egressId: string): Promise<EgressState>;
  /** Detiene el egreso (si hay) y cierra la sala, lo que desconecta a quien publicaba. Nunca lanza. */
  stop(egressId: string | null): Promise<void>;
}

/** Solo se acepta RTMP(S) hacia servidores de YouTube: el egreso no es un reenviador genérico. */
export function validateIngestUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 400) throw new DomainError("youtube_error", "La dirección de entrada de YouTube no es válida.");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new DomainError("youtube_error", "La dirección de entrada de YouTube no es válida.");
  }
  const ok = (u.protocol === "rtmp:" || u.protocol === "rtmps:") && /(^|\.)youtube\.com$/i.test(u.hostname) && !u.username && !u.password && u.pathname.split("/").filter(Boolean).length >= 2;
  if (!ok) throw new DomainError("youtube_error", "La dirección de entrada de YouTube no es válida.");
  return raw;
}
