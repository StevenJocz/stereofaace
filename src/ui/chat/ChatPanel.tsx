"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_GIFS, gifByKey } from "@/modules/chat/gifs";
import type { PublicMessage, PublicRequest } from "@/modules/chat/service";
import { EMOJI_GROUPS } from "./emojis";
import { getClientId, getNick, mergeMessages, postJson, saveNick, type ChatConfig, type MessagesResponse, type RequestsResponse } from "./chat-client";

const POLL_MS = 3500;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false });

type Tab = "chat" | "requests";

/** Chat público de StereoFace Radio y pedidos de canciones. Solo consulta al servidor mientras está abierto. */
export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [requests, setRequests] = useState<PublicRequest[]>([]);
  const lastRef = useRef<number | undefined>(undefined);
  const idRef = useRef("");

  // Mensajes y pedidos: sondeo suave mientras el panel está abierto y la pestaña visible.
  useEffect(() => {
    if (!open) return;
    idRef.current = getClientId();
    let alive = true;
    const pull = async () => {
      if (document.visibilityState === "hidden") return;
      const cid = encodeURIComponent(idRef.current);
      try {
        const after = lastRef.current !== undefined ? `&after=${lastRef.current}` : "";
        const r = await fetch(`/api/chat/messages?clientId=${cid}${after}`, { cache: "no-store" });
        if (r.ok && alive) {
          const d = (await r.json()) as MessagesResponse;
          setConfig(d.config);
          lastRef.current = d.last;
          setMessages((cur) => mergeMessages(cur, d.messages));
        }
        const q = await fetch(`/api/chat/requests?clientId=${cid}`, { cache: "no-store" });
        if (q.ok && alive) {
          const d = (await q.json()) as RequestsResponse;
          setRequests(d.requests);
        }
      } catch {
        /* sin red: se reintenta en el siguiente ciclo */
      }
    };
    void pull();
    const t = setInterval(() => void pull(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open]);

  // Esc cierra el panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <section id="chat-panel" role="dialog" aria-label="Chat de la radio" className="chat-panel">
      <header className="chat-head">
        <div role="tablist" aria-label="Chat" className="flex gap-1.5">
          <button role="tab" type="button" aria-selected={tab === "chat"} className={tab === "chat" ? "btn btn-accent !px-3 !py-1" : "btn !px-3 !py-1"} onClick={() => setTab("chat")}>
            Chat
          </button>
          <button role="tab" type="button" aria-selected={tab === "requests"} className={tab === "requests" ? "btn btn-accent !px-3 !py-1" : "btn !px-3 !py-1"} onClick={() => setTab("requests")}>
            Pedir canción
          </button>
        </div>
        <button type="button" className="btn-icon !size-8" onClick={onClose} aria-label="Cerrar el chat">
          ✕
        </button>
      </header>
      {tab === "chat" ? (
        <ChatTab config={config} messages={messages} onSent={(m) => setMessages((cur) => mergeMessages(cur, [m]))} />
      ) : (
        <RequestsTab config={config} requests={requests} onCreated={() => void 0} />
      )}
    </section>
  );
}

function NickField({ nick, setNick }: { nick: string; setNick: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mono muted block text-[0.62rem]">Tu apodo</span>
      <input
        className="input !py-1.5"
        value={nick}
        maxLength={20}
        onChange={(e) => setNick(e.target.value)}
        onBlur={() => saveNick(nick.trim())}
        placeholder="Ej.: Ana"
        autoComplete="nickname"
      />
    </label>
  );
}

function ChatTab({ config, messages, onSent }: { config: ChatConfig | null; messages: PublicMessage[]; onSent: (m: PublicMessage) => void }) {
  const [nick, setNick] = useState("");
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<"emoji" | "gif" | null>(null);
  const [group, setGroup] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // El apodo guardado solo existe en el navegador.
    setNick(getNick()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (payload: { text?: string; gif?: string }) => {
      const n = nick.trim();
      if (n.length < 2) {
        setError("Escribe un apodo de al menos 2 letras.");
        return;
      }
      saveNick(n);
      setBusy(true);
      setError(null);
      const r = await postJson<{ message: PublicMessage }>("/api/chat/messages", { clientId: getClientId(), nickname: n, ...payload });
      setBusy(false);
      if (!r.ok) return setError(r.error);
      onSent(r.data.message);
      setText("");
      setPicker(null);
      stick.current = true;
    },
    [nick, onSent],
  );

  if (config && !config.enabled) {
    return <p className="chat-off">El chat está en pausa. Vuelve cuando haya transmisión en vivo.</p>;
  }

  return (
    <>
      <div
        ref={listRef}
        className="chat-list"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        aria-live="polite"
      >
        {messages.length === 0 && <p className="mono muted p-3 text-[0.74rem]">Aún no hay mensajes. ¡Escribe el primero!</p>}
        {messages.map((m) =>
          m.kind === "request" ? (
            <div key={m.id} className="chat-request-card" data-mine={m.mine}>
              <span className="chat-request-disc" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M9 17V5l10-2v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="6.5" cy="17.5" r="2.5" />
                  <circle cx="16.5" cy="15.5" r="2.5" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="mono text-[0.6rem] text-accent-ink">
                  <strong className="text-fg">{m.nickname}</strong> pidió una canción
                </p>
                <p className="chat-request-title">{m.body}</p>
                {m.artist && <p className="chat-request-artist">{m.artist}</p>}
                {m.note && <p className="chat-request-note">“{m.note}”</p>}
              </div>
              <time className="mono muted self-start text-[0.58rem]">{hhmm(m.at)}</time>
            </div>
          ) : (
          <div key={m.id} className="chat-msg" data-mine={m.mine}>
            <span className="chat-nick">{m.nickname}</span>
            <time className="mono muted text-[0.6rem]">{hhmm(m.at)}</time>
            {m.body && <p className="chat-body">{m.body}</p>}
            {m.gif && gifByKey(m.gif) && (
              // eslint-disable-next-line @next/next/no-img-element -- GIF propio de /public
              <img src={gifByKey(m.gif)!.src} alt={gifByKey(m.gif)!.label} className="chat-gif" width={96} height={96} loading="lazy" />
            )}
          </div>
          ),
        )}
      </div>

      {picker === "emoji" && (
        <div className="chat-picker" role="group" aria-label="Emojis">
          <div className="flex gap-1">
            {EMOJI_GROUPS.map((g, i) => (
              <button key={g.label} type="button" className="chat-emoji-tab" aria-pressed={group === i} aria-label={g.label} onClick={() => setGroup(i)}>
                {g.icon}
              </button>
            ))}
          </div>
          <div className="chat-emoji-grid">
            {EMOJI_GROUPS[group].items.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  setText((t) => (t + e).slice(0, 280));
                  inputRef.current?.focus();
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      {picker === "gif" && (
        <div className="chat-picker" role="group" aria-label="GIFs">
          <div className="chat-gif-grid">
            {CHAT_GIFS.map((g) => (
              <button key={g.key} type="button" disabled={busy} onClick={() => void send({ gif: g.key })} aria-label={`Enviar GIF: ${g.label}`} title={g.label}>
                {/* eslint-disable-next-line @next/next/no-img-element -- GIF propio de /public */}
                <img src={g.src} alt="" width={64} height={64} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void send({ text });
        }}
      >
        {nick.trim().length < 2 && <NickField nick={nick} setNick={setNick} />}
        {error && (
          <p role="alert" className="mono text-[0.68rem] text-[#ff8a8a]">
            {error}
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-icon !size-9" aria-pressed={picker === "emoji"} aria-label="Emojis" onClick={() => setPicker(picker === "emoji" ? null : "emoji")}>
            😊
          </button>
          <button type="button" className="btn-icon !size-9 mono !text-[0.62rem]" aria-pressed={picker === "gif"} aria-label="GIFs" onClick={() => setPicker(picker === "gif" ? null : "gif")}>
            GIF
          </button>
          <input ref={inputRef} className="input !py-2" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" />
          <button type="submit" className="btn btn-accent !px-3 !py-2" disabled={busy || !text.trim()}>
            Enviar
          </button>
        </div>
        {nick.trim().length >= 2 && (
          <p className="mono muted text-[0.6rem]">
            Chateas como <strong>{nick.trim()}</strong> ·{" "}
            <button type="button" className="underline" onClick={() => setNick("")}>
              cambiar
            </button>
          </p>
        )}
      </form>
    </>
  );
}

const STATUS_LABEL = { pending: "Esperando", played: "Sonó", rejected: "—" } as const;

function RequestsTab({ config, requests, onCreated }: { config: ChatConfig | null; requests: PublicRequest[]; onCreated: () => void }) {
  const [nick, setNick] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNick(getNick()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  if (config && !config.requestsEnabled) {
    return <p className="chat-off">Los pedidos de canciones están cerrados por ahora. Se abren cuando hay un DJ en vivo.</p>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nick.trim().length < 2) return setMsg({ ok: false, text: "Escribe un apodo de al menos 2 letras." });
    saveNick(nick.trim());
    setBusy(true);
    const r = await postJson<{ duplicate: boolean }>("/api/chat/requests", { clientId: getClientId(), nickname: nick.trim(), title, artist, note });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.data.duplicate ? "Ese pedido ya está en la lista." : "¡Pedido enviado! El DJ lo verá." });
    setTitle("");
    setArtist("");
    setNote("");
    onCreated();
  };

  return (
    <div className="chat-requests">
      <form onSubmit={submit} className="grid gap-2">
        <NickField nick={nick} setNick={setNick} />
        <label className="block">
          <span className="mono muted block text-[0.62rem]">Canción *</span>
          <input className="input !py-1.5" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} placeholder="Título" />
        </label>
        <label className="block">
          <span className="mono muted block text-[0.62rem]">Artista</span>
          <input className="input !py-1.5" value={artist} maxLength={100} onChange={(e) => setArtist(e.target.value)} placeholder="Opcional" />
        </label>
        <label className="block">
          <span className="mono muted flex justify-between text-[0.62rem]">
            <span>Comentario (opcional)</span>
            <span>{note.length}/100</span>
          </span>
          <input className="input !py-1.5" value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: dedicada a mi novia 💜" />
        </label>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`mono text-[0.68rem] ${msg.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
            {msg.text}
          </p>
        )}
        <button type="submit" className="btn btn-accent w-full" disabled={busy || !title.trim()}>
          Pedir canción
        </button>
        <p className="mono muted text-[0.6rem]">El DJ decide qué suena. No hay garantía de que se reproduzca.</p>
      </form>
      <h3 className="mono mt-3 text-[0.66rem] text-accent-ink">Pedidos recientes</h3>
      <ul className="chat-req-list">
        {requests.length === 0 && <li className="mono muted text-[0.7rem]">Todavía no hay pedidos.</li>}
        {requests.map((r) => (
          <li key={r.id} data-mine={r.mine}>
            <span className="min-w-0">
              <span className="block truncate font-bold leading-tight">{r.title}</span>
              <span className="mono muted block truncate text-[0.62rem]">
                {r.artist ? `${r.artist} · ` : ""}
                {r.nickname}
              </span>
              {r.note && <span className="block truncate text-[0.72rem] italic text-muted">“{r.note}”</span>}
            </span>
            <span className={r.status === "played" ? "badge badge-ok" : "badge"}>{STATUS_LABEL[r.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
