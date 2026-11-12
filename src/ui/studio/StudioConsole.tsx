"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { DeckPanel, type DeckView } from "./DeckPanel";
import { LibraryPanel } from "./LibraryPanel";
import { LiveBar } from "./LiveBar";
import { QueuePanel } from "./QueuePanel";
import { AudioEngine, type DeckId } from "./engine/audio-engine";
import { makeItems } from "./engine/audio-files";
import { planCrossfade } from "./engine/crossfade";
import { queueReducer, type QueueItem } from "./engine/queue";
import { WEBCAST_MIME, WEBCAST_URL, WebcastSender, type LiveState, type RecorderLike, type SocketLike } from "./engine/webcast";

const FADE_SEC = 6;
const CREDS_KEY = "sf-studio-dj";
const other = (d: DeckId): DeckId => (d === "A" ? "B" : "A");
const emptyDeck = (): DeckView => ({ item: null, durationSec: null, currentSec: 0, playing: false, levelDb: -100, volume: 1 });

type Creds = { user: string; password: string };

function storedCreds(): string {
  try {
    return sessionStorage.getItem(CREDS_KEY) ?? "";
  } catch {
    return ""; // sin almacenamiento: se escriben a mano
  }
}

function parseCreds(raw: string): Partial<Creds> {
  try {
    return raw ? (JSON.parse(raw) as Partial<Creds>) : {};
  } catch {
    return {};
  }
}

const noopSubscribe = () => () => {};

export function StudioConsole() {
  const [queue, dispatch] = useReducer(queueReducer, [] as QueueItem[]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [auto, setAuto] = useState(true);
  const [decks, setDecks] = useState<Record<DeckId, DeckView>>({ A: emptyDeck(), B: emptyDeck() });
  const [active, setActive] = useState<DeckId>("A");
  const [live, setLive] = useState<LiveState>("offline");
  const rawCreds = useSyncExternalStore(noopSubscribe, storedCreds, () => "");
  const [edits, setEdits] = useState<Partial<Creds>>({});
  const creds = useMemo<Creds>(() => ({ user: "", password: "", ...parseCreds(rawCreds), ...edits }), [rawCreds, edits]);
  const [elapsed, setElapsed] = useState(0);
  const [masterDb, setMasterDb] = useState(-100);
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [monitor, setMonitor] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);
  const senderRef = useRef<WebcastSender | null>(null);
  const queueRef = useRef(queue);
  const activeRef = useRef(active);
  const autoRef = useRef(auto);
  const fadingRef = useRef(false);
  const liveSinceRef = useRef<number | null>(null);
  useEffect(() => {
    queueRef.current = queue;
    activeRef.current = active;
    autoRef.current = auto;
  }, [queue, active, auto]);

  const getEngine = useCallback((): AudioEngine => {
    if (engineRef.current) return engineRef.current;
    const e = new AudioEngine();
    e.setMasterVolume(0.9);
    e.onDeckEnded = (id) => {
      setDecks((d) => ({ ...d, [id]: { ...d[id], playing: false } }));
    };
    e.onDeckTime = (id, current, duration) => {
      setDecks((d) => ({ ...d, [id]: { ...d[id], currentSec: current } }));
      if (id !== activeRef.current || fadingRef.current || !autoRef.current) return;
      const plan = planCrossfade({ durationSec: duration, fadeSec: FADE_SEC });
      if (!plan || current < plan.startAtSec) return;
      const next = queueRef.current[0];
      if (!next) return;
      fadingRef.current = true;
      void (async () => {
        try {
          const to = other(id);
          dispatch({ type: "remove", id: next.id });
          const { durationSec } = await e.loadDeck(to, next);
          setDecks((d) => ({ ...d, [to]: { ...d[to], item: next, durationSec, currentSec: 0, playing: true } }));
          await e.crossfadeTo(to, plan.fadeSec);
          setActive(to);
          senderRef.current?.setMetadata({ title: next.title, artist: next.artist });
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "No se pudo pasar a la siguiente pista.");
        } finally {
          fadingRef.current = false;
        }
      })();
    };
    engineRef.current = e;
    return e;
  }, []);

  // Niveles en vivo.
  useEffect(() => {
    const t = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const l = e.getLevels();
      setMasterDb(l.master.peakDb);
      setDecks((d) => ({ A: { ...d.A, levelDb: l.A }, B: { ...d.B, levelDb: l.B } }));
    }, 80);
    return () => clearInterval(t);
  }, []);

  // Cronómetro al aire.
  useEffect(() => {
    if (live !== "live") return;
    if (liveSinceRef.current === null) liveSinceRef.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (liveSinceRef.current ?? Date.now())) / 1000)), 500);
    return () => clearInterval(t);
  }, [live]);

  // Aviso al cerrar la pestaña mientras se transmite.
  useEffect(() => {
    if (live === "offline" || live === "auth-error" || live === "error") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [live]);

  // Limpieza al salir de la página.
  useEffect(
    () => () => {
      senderRef.current?.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
    },
    [],
  );

  const addFiles = useCallback((files: File[]) => {
    const { items, rejected: bad } = makeItems(files);
    setRejected(bad);
    if (!items.length) return;
    dispatch({ type: "add", items });
    // Duración de cada pista para mostrarla en la cola (sin cargarla en un deck).
    for (const it of items) {
      if (!it.file) continue;
      const a = new Audio();
      const url = URL.createObjectURL(it.file);
      a.preload = "metadata";
      a.src = url;
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration) && a.duration > 0) dispatch({ type: "duration", id: it.id, durationSec: a.duration });
        URL.revokeObjectURL(url);
      };
      a.onerror = () => URL.revokeObjectURL(url);
    }
  }, []);

  const loadToDeck = useCallback(
    async (item: QueueItem, id: DeckId) => {
      try {
        setMessage(null);
        const e = getEngine();
        await e.resume();
        const { durationSec } = await e.loadDeck(id, item);
        dispatch({ type: "remove", id: item.id });
        setDecks((d) => ({ ...d, [id]: { ...d[id], item, durationSec, currentSec: 0, playing: false } }));
        if (!decks[other(id)].playing) {
          e.cut(id);
          setActive(id);
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "No se pudo cargar la pista.");
      }
    },
    [decks, getEngine],
  );

  const play = useCallback(
    async (id: DeckId) => {
      try {
        const e = getEngine();
        await e.resume();
        await e.play(id);
        setDecks((d) => ({ ...d, [id]: { ...d[id], playing: true } }));
        if (!decks[other(id)].playing) {
          e.cut(id);
          setActive(id);
        }
        const item = decks[id].item;
        if (item) senderRef.current?.setMetadata({ title: item.title, artist: item.artist });
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "No se pudo reproducir.");
      }
    },
    [decks, getEngine],
  );

  const pause = useCallback(
    (id: DeckId) => {
      engineRef.current?.pause(id);
      setDecks((d) => ({ ...d, [id]: { ...d[id], playing: false } }));
    },
    [],
  );

  const toggleLive = useCallback(async () => {
    if (live === "live" || live === "connecting" || live === "reconnecting") {
      senderRef.current?.stop();
      senderRef.current = null;
      liveSinceRef.current = null;
      setElapsed(0);
      return;
    }
    if (senderRef.current) return; // doble clic: ya hay una conexión en curso
    try {
      setMessage(null);
      const e = getEngine();
      await e.resume();
      try {
        sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
      } catch {
        /* sin almacenamiento */
      }
      const sender = new WebcastSender({
        url: WEBCAST_URL,
        creds,
        mime: WEBCAST_MIME,
        stream: e.stream,
        createSocket: (u, p) => new WebSocket(u, p) as unknown as SocketLike,
        createRecorder: (s, o) => new MediaRecorder(s, o) as unknown as RecorderLike,
        onState: (s) => {
          setLive(s);
          if (s === "auth-error" || s === "error" || s === "offline") {
            senderRef.current = null;
            liveSinceRef.current = null;
          }
        },
      });
      senderRef.current = sender;
      const item = decks[activeRef.current].item;
      if (item) sender.setMetadata({ title: item.title, artist: item.artist });
      sender.start();
    } catch (err) {
      senderRef.current = null;
      setMessage(err instanceof Error ? err.message : "No se pudo iniciar la emisión.");
    }
  }, [live, creds, decks, getEngine]);

  // Atajo: espacio = play/pausa del deck activo (fuera de campos de texto).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.isContentEditable)) return;
      e.preventDefault();
      const id = activeRef.current;
      if (decks[id].playing) pause(id);
      else void play(id);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [decks, play, pause]);

  return (
    <div className="studio grid gap-4">
      <LiveBar
        state={live}
        user={creds.user}
        password={creds.password}
        onUser={(user) => setEdits((c) => ({ ...c, user }))}
        onPassword={(password) => setEdits((c) => ({ ...c, password }))}
        onToggle={() => void toggleLive()}
        elapsedSec={elapsed}
        masterDb={masterDb}
        masterVolume={masterVolume}
        onMasterVolume={(v) => {
          setMasterVolume(v);
          engineRef.current?.setMasterVolume(v);
        }}
        monitor={monitor}
        onMonitor={(v) => {
          setMonitor(v);
          engineRef.current?.setMonitor(v);
        }}
        message={message}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {(["A", "B"] as const).map((id) => (
          <DeckPanel
            key={id}
            id={id}
            deck={decks[id]}
            active={active === id}
            onPlay={() => void play(id)}
            onPause={() => pause(id)}
            onSeek={(s) => engineRef.current?.seek(id, s)}
            onVolume={(v) => {
              setDecks((d) => ({ ...d, [id]: { ...d[id], volume: v } }));
              engineRef.current?.setDeckVolume(id, v);
            }}
          />
        ))}
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
      <QueuePanel
        queue={queue}
        rejected={rejected}
        auto={auto}
        onAuto={setAuto}
        onAddFiles={addFiles}
        onAddItems={(items) => dispatch({ type: "add", items })}
        onMove={(from, to) => dispatch({ type: "move", from, to })}
        onRemove={(id) => dispatch({ type: "remove", id })}
        onClear={() => dispatch({ type: "clear" })}
        onLoad={(item, id) => void loadToDeck(item, id)}
      />
      <LibraryPanel onAdd={(items) => dispatch({ type: "add", items })} />
      </div>
    </div>
  );
}
