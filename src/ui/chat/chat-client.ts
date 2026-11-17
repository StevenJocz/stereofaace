import type { PublicMessage, PublicRequest } from "@/modules/chat/service";

const ID_KEY = "sf-chat-id";
const NICK_KEY = "sf-chat-nick";

/** Identificador anónimo de este navegador (no es un dato personal). */
export function getClientId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return `tmp-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export const getNick = (): string => {
  try {
    return localStorage.getItem(NICK_KEY) ?? "";
  } catch {
    return "";
  }
};
export const saveNick = (nick: string) => {
  try {
    localStorage.setItem(NICK_KEY, nick);
  } catch {
    /* solo vale para esta visita */
  }
};

/** Suma los mensajes nuevos a los que ya hay, sin repetir y con un tope para que la lista no crezca sin fin. */
export function mergeMessages(current: PublicMessage[], incoming: PublicMessage[], cap = 200): PublicMessage[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((m) => m.id));
  const merged = [...current, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

export type ChatConfig = { enabled: boolean; requestsEnabled: boolean };
export type MessagesResponse = { config: ChatConfig; messages: PublicMessage[]; last: number };
export type RequestsResponse = { config: ChatConfig; requests: PublicRequest[] };

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    return res.ok ? { ok: true, data } : { ok: false, error: data.error ?? "No se pudo enviar." };
  } catch {
    return { ok: false, error: "Sin conexión. Inténtalo de nuevo." };
  }
}
