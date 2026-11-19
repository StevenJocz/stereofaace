"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_GIFS, gifByKey } from "@/modules/chat/gifs";
import type { PublicMessage, PublicRequest } from "@/modules/chat/service";
import { EMOJI_GROUPS } from "./emojis";
import { mergeMessages, postJson, type ChatConfig, type ChatReset, type MessagesResponse, type RequestsResponse, type Viewer } from "./chat-client";

const POLL_MS = 3500;
/** Origen de la imagen de un GIF del chat: de la bandeja (clave corta) o propio de alguien («u:<id>», servido por /s). */
const gifView = (key: string | null): { src: string; label: string } | null => {
  if (!key) return null;
  const g = gifByKey(key);
  if (g) return { src: g.src, label: g.label };
  return /^u:[0-9a-f-]{36}$/i.test(key) ? { src: `/s/${key.slice(2)}`, label: "GIF" } : null;
};
type MyGif = { id: string; key: string; url: string };

/** Chulo de verificado junto al nombre. */
function Check() {
  return (
    <svg className="chat-check" width="13" height="13" viewBox="0 0 24 24" aria-label="Cuenta verificada" role="img">
      <circle cx="12" cy="12" r="10.5" fill="currentColor" />
      <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#07080a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false });

type Tab = "chat" | "requests";

/** Chat público de StereoFace Radio y pedidos de canciones. Solo consulta al servidor mientras está abierto. */
export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("chat");
  const [config, setConfig] = useState<ChatConfig | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [requests, setRequests] = useState<PublicRequest[]>([]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [reset, setReset] = useState<ChatReset | null>(null);
  const lastRef = useRef<number | undefined>(undefined);
  const windowRef = useRef<string | null>(null);

  // Mensajes y pedidos: sondeo suave mientras el panel está abierto y la pestaña visible.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const pull = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const after = lastRef.current !== undefined ? `&after=${lastRef.current}` : "";
        const r = await fetch(`/api/chat/messages?${after.slice(1)}`, { cache: "no-store" });
        if (r.ok && alive) {
          const d = (await r.json()) as MessagesResponse;
          setConfig(d.config);
          setViewer(d.viewer);
          setReset(d.reset);
          // Si cambió la ventana de 6 horas, el chat arranca limpio: se descarta lo que había en pantalla.
          const fresh = windowRef.current !== null && windowRef.current !== d.reset.startsAt;
          windowRef.current = d.reset.startsAt;
          if (fresh) {
            lastRef.current = undefined;
            setMessages([]);
            return;
          }
          lastRef.current = d.last;
          setMessages((cur) => mergeMessages(cur, d.messages));
        }
        const q = await fetch("/api/chat/requests", { cache: "no-store" });
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
        <ChatTab config={config} viewer={viewer} reset={reset} messages={messages} onSent={(m) => setMessages((cur) => mergeMessages(cur, [m]))} />
      ) : (
        <RequestsTab config={config} viewer={viewer} requests={requests} onCreated={() => void 0} />
      )}
    </section>
  );
}

/** Quien no tiene cuenta puede leer, pero para escribir o pedir canciones debe registrarse (gratis) o entrar. */
function AuthGate({ what }: { what: string }) {
  return (
    <div className="chat-gate" role="note">
      <p className="chat-gate-title">Necesitas una cuenta</p>
      <p className="chat-gate-text">Para {what} regístrate gratis: obtienes tu propio Space y tu nombre en la radio.</p>
      <div className="flex flex-wrap gap-2">
        <a href="/spaces/registro" className="btn btn-accent !px-3 !py-2">
          Crear mi Space — gratis
        </a>
        <a href="/spaces/entrar" className="btn !px-3 !py-2">
          Ya tengo cuenta
        </a>
      </div>
    </div>
  );
}

/** «Participas como @usuario · Mi Space». */
function AsLine({ nickname }: { nickname: string }) {
  return (
    <p className="mono muted text-[0.6rem]">
      Participas como <strong className="text-fg">{nickname}</strong> ·{" "}
      <a href="/spaces/editar" className="underline">
        Mi Space
      </a>
    </p>
  );
}

function ChatTab({ config, viewer, reset, messages, onSent }: { config: ChatConfig | null; viewer: Viewer | null; reset: ChatReset | null; messages: PublicMessage[]; onSent: (m: PublicMessage) => void }) {
  const [text, setText] = useState("");
  const [picker, setPicker] = useState<"emoji" | "gif" | null>(null);
  const [group, setGroup] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<MyGif[]>([]);
  const [shared, setShared] = useState<MyGif[]>([]);
  const [upBusy, setUpBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = useCallback(
    async (payload: { text?: string; gif?: string }) => {
      setBusy(true);
      setError(null);
      const r = await postJson<{ message: PublicMessage }>("/api/chat/messages", payload);
      setBusy(false);
      if (!r.ok) return setError(r.error);
      onSent(r.data.message);
      setText("");
      setPicker(null);
      stick.current = true;
    },
    [onSent],
  );

  // Mis GIF: se cargan al abrir la bandeja de GIF (solo con cuenta).
  useEffect(() => {
    if (picker !== "gif" || !viewer?.signedIn) return;
    let alive = true;
    fetch("/api/chat/gifs", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ gifs: MyGif[]; shared: MyGif[] }>) : null))
      .then((d) => {
        if (d && alive) {
          setMine(d.gifs);
          setShared(d.shared);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [picker, viewer?.signedIn]);

  const uploadGif = async (file: File | undefined) => {
    if (!file) return;
    setUpBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/chat/gifs", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { gif?: MyGif; error?: string };
      if (!res.ok || !body.gif) throw new Error(body.error ?? "No se pudo subir el GIF.");
      setMine((cur) => [...cur, body.gif!]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir el GIF.");
    } finally {
      setUpBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeGif = async (id: string) => {
    setError(null);
    const res = await fetch(`/api/chat/gifs?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setMine((cur) => cur.filter((g) => g.id !== id));
    else setError("No se pudo borrar el GIF.");
  };

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
        {reset && <p className="mono muted px-3 pb-1 pt-0.5 text-[0.58rem]">El chat se reinicia cada 6 horas · próximo reinicio a las {hhmm(reset.resetsAt)}</p>}
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
                  <strong className="text-fg">{m.nickname}</strong>{m.verified && <Check />} pidió una canción
                </p>
                <p className="chat-request-title">{m.body}</p>
                {m.artist && <p className="chat-request-artist">{m.artist}</p>}
                {m.note && <p className="chat-request-note">“{m.note}”</p>}
              </div>
              <time className="mono muted self-start text-[0.58rem]">{hhmm(m.at)}</time>
            </div>
          ) : (
          <div key={m.id} className="chat-msg" data-mine={m.mine}>
            <span className="chat-nick">
              {m.nickname}
              {m.verified && <Check />}
            </span>
            <time className="mono muted text-[0.6rem]">{hhmm(m.at)}</time>
            {m.body && <p className="chat-body">{m.body}</p>}
            {gifView(m.gif) && (
              // eslint-disable-next-line @next/next/no-img-element -- GIF de la bandeja (/public) o propio de alguien (servido por /s)
              <img src={gifView(m.gif)!.src} alt={gifView(m.gif)!.label} className="chat-gif" width={96} height={96} loading="lazy" />
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
          <div className="chat-mygifs">
            <div className="flex items-center justify-between gap-2">
              <p className="mono text-[0.62rem] text-accent-ink">Mis GIF ({mine.length}/12)</p>
              <label className="btn !px-2.5 !py-1 !text-[0.62rem]" aria-disabled={upBusy}>
                {upBusy ? "Subiendo…" : "Subir GIF"}
                <input ref={fileRef} type="file" accept="image/gif" hidden disabled={upBusy || mine.length >= 12} onChange={(e) => void uploadGif(e.target.files?.[0])} />
              </label>
            </div>
            <p className="mono muted text-[0.58rem]">Solo GIF de hasta 2 MB y 600×600 px. Los que subes los puede usar cualquier persona del chat.</p>
            {mine.length > 0 && (
              <div className="chat-gif-grid">
                {mine.map((g) => (
                  <span key={g.id} className="chat-mygif">
                    <button type="button" disabled={busy} onClick={() => void send({ gif: g.key })} aria-label="Enviar mi GIF">
                      {/* eslint-disable-next-line @next/next/no-img-element -- GIF propio servido por /s */}
                      <img src={g.url} alt="" width={64} height={64} loading="lazy" />
                    </button>
                    <button type="button" className="chat-mygif-x" onClick={() => void removeGif(g.id)} aria-label="Borrar este GIF">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {shared.length > 0 && (
            <div className="chat-mygifs">
              <p className="mono text-[0.62rem] text-accent-ink">Comunidad ({shared.length})</p>
              <div className="chat-gif-grid">
                {shared.map((g) => (
                  <button key={g.id} type="button" disabled={busy} onClick={() => void send({ gif: g.key })} aria-label="Enviar este GIF de la comunidad">
                    {/* eslint-disable-next-line @next/next/no-img-element -- GIF de otra persona servido por /s */}
                    <img src={g.url} alt="" width={64} height={64} loading="lazy" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewer && !viewer.signedIn ? (
        <div className="chat-compose">
          <AuthGate what="hablar en el chat" />
        </div>
      ) : viewer && viewer.nickname === null ? (
        <div className="chat-compose">
          <p className="mono text-[0.68rem] text-[#ff8a8a]">Tu cuenta está suspendida del chat.</p>
        </div>
      ) : (
        <form
          className="chat-compose"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) void send({ text });
          }}
        >
          {error && (
            <p role="alert" className="mono text-[0.68rem] text-[#ff8a8a]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn-icon !size-9" aria-pressed={picker === "emoji"} aria-label="Emojis" onClick={() => setPicker(picker === "emoji" ? null : "emoji")} disabled={!viewer}>
              😊
            </button>
            <button type="button" className="btn-icon !size-9 mono !text-[0.62rem]" aria-pressed={picker === "gif"} aria-label="GIFs" onClick={() => setPicker(picker === "gif" ? null : "gif")} disabled={!viewer}>
              GIF
            </button>
            <input ref={inputRef} className="input !py-2" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…" aria-label="Mensaje" disabled={!viewer} />
            <button type="submit" className="btn btn-accent !px-3 !py-2" disabled={busy || !viewer || !text.trim()}>
              Enviar
            </button>
          </div>
          {viewer?.nickname && <AsLine nickname={viewer.nickname} />}
        </form>
      )}
    </>
  );
}

const STATUS_LABEL = { pending: "Esperando", played: "Sonó", rejected: "—" } as const;

function RequestsTab({ config, viewer, requests, onCreated }: { config: ChatConfig | null; viewer: Viewer | null; requests: PublicRequest[]; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  if (config && !config.requestsEnabled) {
    return <p className="chat-off">Los pedidos de canciones están cerrados por ahora. Se abren cuando hay un DJ en vivo.</p>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await postJson<{ duplicate: boolean }>("/api/chat/requests", { title, artist, note });
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
      {viewer && !viewer.signedIn ? (
        <AuthGate what="pedir canciones" />
      ) : viewer && viewer.nickname === null ? (
        <p className="mono text-[0.68rem] text-[#ff8a8a]">Tu cuenta está suspendida del chat.</p>
      ) : (
      <form onSubmit={submit} className="grid gap-2">
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
        {viewer?.nickname && <AsLine nickname={viewer.nickname} />}
        <p className="mono muted text-[0.6rem]">El DJ decide qué suena. No hay garantía de que se reproduzca.</p>
      </form>
      )}
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
