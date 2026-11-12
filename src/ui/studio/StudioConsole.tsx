"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { DeckPanel, type DeckView } from "./DeckPanel";
import { LibraryPanel } from "./LibraryPanel";
import { LiveBar } from "./LiveBar";
import { QueuePanel } from "./QueuePanel";
import { AudioEngine, LoadSupersededError, type DeckId } from "./engine/audio-engine";
import { makeItems } from "./engine/audio-files";
import { pickNext, shouldAdvanceOnEnd, shouldStartFade } from "./engine/autoplay";
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
  const startingRef = useRef(false);
  // Un deck «cedió el aire» cuando ya empezó el fundido hacia el otro: no debe volver a disparar nada.
  const handedOffRef = useRef<Record<DeckId, boolean>>({ A: false, B: false });
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
    const markActive = (id: DeckId) => {
      activeRef.current = id; // síncrono: el siguiente timeupdate ya debe ver el deck nuevo
      setActive(id);
    };
    const flow = (id: DeckId) => ({
      deckId: id,
      activeId: activeRef.current,
      handedOff: handedOffRef.current[id],
      fading: fadingRef.current,
      auto: autoRef.current,
    });
    /** Pasa al siguiente: con fundido (pista que llega a su ventana final) o en seco (pista que ya terminó). */
    const startNext = async (from: DeckId, mode: "fade" | "cut") => {
      const to = other(from);
      const pick = pickNext({
        queue: queueRef.current,
        otherDeckItem: e.deckItem(to),
        otherDeckPlaying: e.isPlaying(to),
        otherDeckConsumed: handedOffRef.current[to],
      });
      if (!pick) return;
      fadingRef.current = true;
      handedOffRef.current[from] = true; // antes de cualquier await: bloquea disparos repetidos
      try {
        let item: QueueItem;
        if (pick.source === "queue") {
          item = pick.item;
          const { durationSec } = await e.loadDeck(to, item);
          dispatch({ type: "remove", id: item.id }); // solo tras cargar bien: si falla, la pista sigue en la cola
          setDecks((d) => ({ ...d, [to]: { ...d[to], item, durationSec, currentSec: 0, playing: false } }));
        } else {
          item = e.deckItem(to) as QueueItem;
        }
        handedOffRef.current[to] = false;
        if (mode === "fade") {
          await e.crossfadeTo(to, FADE_SEC);
        } else {
          e.cut(to);
          await e.play(to);
        }
        setDecks((d) => ({ ...d, [to]: { ...d[to], playing: true } }));
        markActive(to);
        senderRef.current?.setMetadata({ title: item.title, artist: item.artist });
      } catch (err) {
        if (mode === "fade") handedOffRef.current[from] = false; // la saliente sigue siendo la dueña del aire
        if (!(err instanceof LoadSupersededError)) {
          setMessage(err instanceof Error ? err.message : "No se pudo pasar a la siguiente pista.");
        }
      } finally {
        fadingRef.current = false;
      }
    };
    e.onDeckEnded = (id) => {
      setDecks((d) => ({ ...d, [id]: { ...d[id], playing: false } }));
      const to = other(id);
      const hasNext =
        pickNext({
          queue: queueRef.current,
          otherDeckItem: e.deckItem(to),
          otherDeckPlaying: e.isPlaying(to),
          otherDeckConsumed: handedOffRef.current[to],
        }) !== null;
      const advance = shouldAdvanceOnEnd({ ...flow(id), hasNext });
      handedOffRef.current[id] = true; // lo que terminó ya no cuenta como precarga
      if (advance) void startNext(id, "cut");
    };
    e.onDeckTime = (id, current, duration) => {
      setDecks((d) => ({ ...d, [id]: { ...d[id], currentSec: current } }));
      if (shouldStartFade({ ...flow(id), current, duration, fadeSec: FADE_SEC })) void startNext(id, "fade");
    };
    engineRef.current = e;
    // Solo en desarrollo: permite verificar el audio desde el navegador con un micrófono simulado.
    if (process.env.NODE_ENV !== "production") Object.assign(window, { __studioEngine: e });
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
        handedOffRef.current[id] = false;
        dispatch({ type: "remove", id: item.id });
        setDecks((d) => ({ ...d, [id]: { ...d[id], item, durationSec, currentSec: 0, playing: false } }));
        if (!durationSec) setMessage(`No se pudo leer la duración de «${item.title}»: no habrá fundido automático al terminar.`);
        if (!e.isPlaying(other(id))) {
          e.cut(id);
          activeRef.current = id;
          setActive(id);
        }
      } catch (err) {
        if (!(err instanceof LoadSupersededError)) setMessage(err instanceof Error ? err.message : "No se pudo cargar la pista.");
      }
    },
    [getEngine],
  );

  const play = useCallback(
    async (id: DeckId) => {
      try {
        const e = getEngine();
        await e.resume();
        await e.play(id);
        setDecks((d) => ({ ...d, [id]: { ...d[id], playing: true } }));
        if (!e.isPlaying(other(id))) {
          e.cut(id);
          handedOffRef.current[id] = false;
          activeRef.current = id;
          setActive(id);
        }
        const item = e.deckItem(id);
        if (item) senderRef.current?.setMetadata({ title: item.title, artist: item.artist });
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "No se pudo reproducir.");
      }
    },
    [getEngine],
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
    if (senderRef.current || startingRef.current) return; // doble clic: ya hay una conexión en curso
    startingRef.current = true;
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
      const item = e.deckItem(activeRef.current);
      if (item) sender.setMetadata({ title: item.title, artist: item.artist });
      sender.start();
    } catch (err) {
      senderRef.current = null;
      setMessage(err instanceof Error ? err.message : "No se pudo iniciar la emisión.");
    } finally {
      startingRef.current = false;
    }
  }, [live, creds, getEngine]);

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
