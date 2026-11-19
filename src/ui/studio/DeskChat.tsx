"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gifByKey } from "@/modules/chat/gifs";
import type { AdminMessage, AdminRequest } from "@/modules/chat/service";
import type { ChatConfig } from "@/ui/chat/chat-client";

export type DeskFeed = { config: ChatConfig | null; messages: AdminMessage[]; requests: AdminRequest[]; error: boolean };

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false });

/** Sondea el chat y los pedidos para el DJ. Siempre activo con la consola a la vista (el contador de pedidos lo necesita). */
export function useDeskFeed(active: boolean) {
  const [feed, setFeed] = useState<DeskFeed>({ config: null, messages: [], requests: [], error: false });
  const lastRef = useRef<number | undefined>(undefined);
  const refresh = useCallback(async () => {
    try {
      const after = lastRef.current !== undefined ? `?after=${lastRef.current}` : "";
      const r = await fetch(`/api/studio/chat${after}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { config: ChatConfig; messages: AdminMessage[]; last: number; requests: AdminRequest[] };
      lastRef.current = d.last;
      setFeed((cur) => {
        const seen = new Set(cur.messages.map((m) => m.id));
        const merged = [...cur.messages, ...d.messages.filter((m) => !seen.has(m.id))].slice(-200);
        return { config: d.config, messages: merged, requests: d.requests, error: false };
      });
    } catch {
      setFeed((cur) => ({ ...cur, error: true }));
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    void refresh();
    const t = setInterval(() => void refresh(), 3500);
    return () => clearInterval(t);
  }, [active, refresh]);
  /** Quita un mensaje de la lista local (la moderación ya lo borró en el servidor). */
  const dropMessage = useCallback((id: number) => setFeed((cur) => ({ ...cur, messages: cur.messages.filter((m) => m.id !== id) })), []);
  return { feed, refresh, dropMessage };
}

async function act(body: object): Promise<boolean> {
  try {
    return (await fetch("/api/studio/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).ok;
  } catch {
    return false;
  }
}

/** Interruptores del chat y de los pedidos (los usa el DJ para abrir y cerrar). */
function Switches({ config, onChange }: { config: ChatConfig | null; onChange: (c: ChatConfig) => void }) {
  if (!config) return null;
  return (
    <div className="mb-3 grid gap-1.5">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={config.enabled} onChange={(e) => onChange({ ...config, enabled: e.target.checked })} />
        <span className="text-[0.88rem]">Chat abierto al público</span>
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={config.requestsEnabled} onChange={(e) => onChange({ ...config, requestsEnabled: e.target.checked })} />
        <span className="text-[0.88rem]">Pedidos de canciones abiertos</span>
      </label>
    </div>
  );
}

export function RequestsPanel({ feed, refresh, onSearch, onYouTube }: { feed: DeskFeed; refresh: () => void; onSearch: (text: string) => void; onYouTube?: (text: string) => void }) {
  const setStatus = async (id: string, status: "played" | "rejected") => {
    await act({ action: "request", id, status });
    refresh();
  };
  const setConfig = async (c: ChatConfig) => {
    await act({ action: "config", ...c });
    refresh();
  };
  return (
    <section className="studio-voice panel" aria-label="Pedidos de canciones">
      <h2 className="display-up text-[1.15rem]">Pedidos de la audiencia</h2>
      <div className="mt-2">
        <Switches config={feed.config} onChange={(c) => void setConfig(c)} />
      </div>
      {feed.error && <p className="mono text-[0.7rem] text-[#ff8a8a]">No se pudo leer el chat. Reintentando…</p>}
      {feed.requests.length === 0 ? (
        <p className="studio-empty !mt-2 !py-3">No hay pedidos esperando.</p>
      ) : (
        <ul className="grid gap-1.5">
          {feed.requests.map((r) => (
            <li key={r.id} className="rounded-[8px] border border-line px-2.5 py-2">
              <p className="truncate font-bold leading-tight" title={r.title}>
                {r.title}
              </p>
              <p className="mono muted truncate text-[0.66rem]">
                {r.artist ? `${r.artist} · ` : ""}
                pide {r.nickname} · {hhmm(r.createdAt)}
              </p>
              {r.note && <p className="mt-0.5 text-[0.8rem] italic text-accent-ink">“{r.note}”</p>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" className="btn !px-2.5 !py-0.5 !text-[0.7rem]" onClick={() => onSearch(`${r.title}${r.artist ? ` ${r.artist}` : ""}`)}>
                  Buscar en la biblioteca
                </button>
                {onYouTube && (
                  <button type="button" className="btn !px-2.5 !py-0.5 !text-[0.7rem]" onClick={() => onYouTube(`${r.title}${r.artist ? ` ${r.artist}` : ""}`)}>
                    Buscar en YouTube
                  </button>
                )}
                <button type="button" className="btn btn-accent !px-2.5 !py-0.5 !text-[0.7rem]" onClick={() => void setStatus(r.id, "played")}>
                  Ya sonó
                </button>
                <button type="button" className="btn !px-2.5 !py-0.5 !text-[0.7rem]" onClick={() => void setStatus(r.id, "rejected")}>
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ChatModPanel({ feed, refresh, dropMessage }: { feed: DeskFeed; refresh: () => void; dropMessage: (id: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [feed.messages]);
  const remove = async (id: number) => {
    dropMessage(id);
    await act({ action: "delete", id });
  };
  const removeGif = async (m: AdminMessage) => {
    if (!m.gif?.startsWith("u:") || !window.confirm("¿Quitar este GIF de la comunidad? Nadie podrá volver a usarlo y se borrará el mensaje.")) return;
    dropMessage(m.id);
    await act({ action: "gif-remove", key: m.gif });
    await act({ action: "delete", id: m.id });
  };
  const mute = async (m: AdminMessage) => {
    if (!window.confirm(`¿Silenciar a ${m.nickname} durante 1 hora? También se borrará su mensaje.`)) return;
    dropMessage(m.id);
    await act({ action: "mute", clientId: m.clientId, minutes: 60 });
    await act({ action: "delete", id: m.id });
  };
  const setConfig = async (c: ChatConfig) => {
    await act({ action: "config", ...c });
    refresh();
  };
  return (
    <section className="studio-voice panel" aria-label="Chat de la audiencia">
      <h2 className="display-up text-[1.15rem]">Chat de la audiencia</h2>
      <div className="mt-2">
        <Switches config={feed.config} onChange={(c) => void setConfig(c)} />
      </div>
      <div ref={listRef} className="desk-chat-list">
        {feed.messages.length === 0 && <p className="studio-empty !py-3">Todavía no hay mensajes.</p>}
        {feed.messages.map((m) => (
          <div key={m.id} className="desk-chat-msg">
            <div className="min-w-0 flex-1">
              <span className="font-bold">{m.nickname}</span>{m.verified && <span className="text-accent-ink" title="Cuenta verificada"> ✓</span>} <time className="mono muted text-[0.6rem]">{hhmm(m.at)}</time>
              {m.kind === "request" ? (
                <p className="text-[0.86rem] leading-snug [overflow-wrap:anywhere]">
                  <span className="text-accent-ink">🎵 pidió</span> <strong>{m.body}</strong>
                  {m.artist ? ` — ${m.artist}` : ""}
                  {m.note && <span className="block italic text-muted">“{m.note}”</span>}
                </p>
              ) : (
                m.body && <p className="text-[0.86rem] leading-snug [overflow-wrap:anywhere]">{m.body}</p>
              )}
              {(gifByKey(m.gif) || /^u:[0-9a-f-]{36}$/i.test(m.gif ?? "")) && (
                // eslint-disable-next-line @next/next/no-img-element -- GIF de la bandeja (/public) o propio de alguien (servido por /s)
                <img src={gifByKey(m.gif)?.src ?? `/s/${(m.gif ?? "").slice(2)}`} alt={gifByKey(m.gif)?.label ?? "GIF"} width={56} height={56} className="mt-1 rounded-md" />
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              <button type="button" className="desk-chat-btn" title="Borrar mensaje" aria-label={`Borrar el mensaje de ${m.nickname}`} onClick={() => void remove(m.id)}>
                ✕
              </button>
              {m.gif?.startsWith("u:") && (
                <button type="button" className="desk-chat-btn" title="Quitar este GIF de la comunidad" aria-label={`Quitar el GIF de ${m.nickname}`} onClick={() => void removeGif(m)}>
                  🚫
                </button>
              )}
              <button type="button" className="desk-chat-btn" title="Silenciar 1 hora" aria-label={`Silenciar a ${m.nickname}`} onClick={() => void mute(m)}>
                🔇
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
