import type { PublicMessage, PublicRequest } from "@/modules/chat/service";

/** Suma los mensajes nuevos a los que ya hay, sin repetir y con un tope para que la lista no crezca sin fin. */
export function mergeMessages(current: PublicMessage[], incoming: PublicMessage[], cap = 200): PublicMessage[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((m) => m.id));
  const merged = [...current, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

export type ChatConfig = { enabled: boolean; requestsEnabled: boolean };
/** Quién mira: ¿tiene cuenta? y, si puede escribir, con qué apodo (su @usuario). `nickname: null` con cuenta = suspendida del chat. */
export type Viewer = { signedIn: boolean; nickname: string | null };
/** Ventana actual del chat: se vacía cada 6 horas (a las 00:00, 06:00, 12:00 y 18:00, hora de Bogotá). */
export type ChatReset = { startsAt: string; resetsAt: string };
export type MessagesResponse = { config: ChatConfig; messages: PublicMessage[]; last: number; viewer: Viewer; reset: ChatReset };
export type RequestsResponse = { config: ChatConfig; requests: PublicRequest[]; viewer: Viewer };

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "No se pudo enviar." };
  } catch {
    return { ok: false, error: "Sin conexión. Inténtalo de nuevo." };
  }
}
