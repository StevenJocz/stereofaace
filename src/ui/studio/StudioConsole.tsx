"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { DeckPanel, type DeckView } from "./DeckPanel";
import { LibraryPanel } from "./LibraryPanel";
import type { DjProgramInfo, StudioProgram } from "@/modules/schedule/dj";
import type { CartView } from "@/modules/studio/carts";
import { CartWall } from "./CartWall";
import { DuckingPanel } from "./DuckingPanel";
import { EqPanel } from "./EqPanel";
import { LiveBar } from "./LiveBar";
import { MicPanel, type MicDevice } from "./MicPanel";
import { QueuePanel } from "./QueuePanel";
import { AudioEngine, LoadSupersededError, type DeckId } from "./engine/audio-engine";
import { makeItems } from "./engine/audio-files";
import { hotkeyMap, isTypingTarget } from "./engine/carts";
import { loadCover, type DeckCover } from "./engine/deck-cover";
import { FLAT_EQ, type EqSettings } from "./engine/eq";
import { DEFAULT_DUCK, type DuckSettings } from "./engine/voice";
import { pickNext, shouldAdvanceOnEnd, shouldStartFade } from "./engine/autoplay";
import { DjGate, type DjEntry } from "./DjGate";
import { queueReducer, type QueueItem } from "./engine/queue";
import { WEBCAST_MIME, WEBCAST_URL, WebcastSender, type LiveState, type RecorderLike, type SocketLike } from "./engine/webcast";

const FADE_SEC = 6;
const CREDS_KEY = "sf-studio-dj";
const other = (d: DeckId): DeckId => (d === "A" ? "B" : "A");
const emptyDeck = (): DeckView => ({ item: null, durationSec: null, currentSec: 0, playing: false, volume: 1, coverUrl: null });

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

/** Primero la entrada del DJ (usuario, contraseña y programa); después, la consola. */
export function StudioConsole() {
  const [entry, setEntry] = useState<DjEntry | null>(null);
  if (!entry) return <DjGate onEnter={setEntry} />;
  return <StudioConsoleInner entry={entry} />;
}

function StudioConsoleInner({ entry }: { entry: DjEntry }) {
  const [queue, dispatch] = useReducer(queueReducer, [] as QueueItem[]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [auto, setAuto] = useState(true);
  const [decks, setDecks] = useState<Record<DeckId, DeckView>>({ A: emptyDeck(), B: emptyDeck() });
  const [active, setActive] = useState<DeckId>("A");
  const [live, setLive] = useState<LiveState>("offline");
  const rawCreds = useSyncExternalStore(noopSubscribe, storedCreds, () => "");
  const [edits, setEdits] = useState<Partial<Creds>>({ user: entry.user, password: entry.password });
  const creds = useMemo<Creds>(() => ({ user: "", password: "", ...parseCreds(rawCreds), ...edits }), [rawCreds, edits]);
  const [elapsed, setElapsed] = useState(0);
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [monitor, setMonitor] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [micGain, setMicGain] = useState(1);
  const [gateDb, setGateDb] = useState(-55);
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [micError, setMicError] = useState<string | null>(null);
  const [duck, setDuck] = useState<DuckSettings>(DEFAULT_DUCK);
  const [eqMusic, setEqMusic] = useState<EqSettings>(FLAT_EQ);
  const [eqMic, setEqMic] = useState<EqSettings>(FLAT_EQ);
  const [carts, setCarts] = useState<CartView[]>([]);
  const [tool, setTool] = useState<"carts" | "voice" | "eq">("carts");
  const [djInfo, setDjInfo] = useState<DjProgramInfo | null>(null);
  const [programChoice, setProgramChoice] = useState(entry.programChoice);
  const [cartState, setCartState] = useState<"loading" | "ready" | "error">("loading");
  const [cartsPlaying, setCartsPlaying] = useState<ReadonlySet<string>>(new Set());

  const engineRef = useRef<AudioEngine | null>(null);
  const senderRef = useRef<WebcastSender | null>(null);
  const queueRef = useRef(queue);
  const activeRef = useRef(active);
  const autoRef = useRef(auto);
  const fadingRef = useRef(false);
  const startingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Un deck «cedió el aire» cuando ya empezó el fundido hacia el otro: no debe volver a disparar nada.
  const handedOffRef = useRef<Record<DeckId, boolean>>({ A: false, B: false });
  const voiceRef = useRef({ duck, eqMusic, eqMic, micMuted, micGain, gateDb });
  const pttRef = useRef(false);
  const liveRef = useRef<LiveState>("offline");
  const djRef = useRef("");
  const loggedRef = useRef<string | null>(null);
  const coversRef = useRef<Record<DeckId, DeckCover | null>>({ A: null, B: null });
  const coverSeqRef = useRef<Record<DeckId, number>>({ A: 0, B: 0 });
  const liveSinceRef = useRef<number | null>(null);
  useEffect(() => {
    queueRef.current = queue;
    activeRef.current = active;
    autoRef.current = auto;
    voiceRef.current = { duck, eqMusic, eqMic, micMuted, micGain, gateDb };
    liveRef.current = live;
    djRef.current = creds.user;
  }, [queue, active, auto, duck, eqMusic, eqMic, micMuted, micGain, gateDb, live, creds.user]);

  /** Busca la carátula de la pista cargada en un deck (sin bloquear la reproducción). */
  const attachCover = useCallback((id: DeckId, item: QueueItem) => {
    const seq = ++coverSeqRef.current[id];
    coversRef.current[id]?.revoke();
    coversRef.current[id] = null;
    setDecks((d) => ({ ...d, [id]: { ...d[id], coverUrl: null } }));
    void loadCover(item).then((cover) => {
      if (!cover) return;
      if (coverSeqRef.current[id] !== seq) {
        cover.revoke(); // llegó tarde: ya hay otra pista en el deck
        return;
      }
      coversRef.current[id] = cover;
      setDecks((d) => ({ ...d, [id]: { ...d[id], coverUrl: cover.url } }));
    });
  }, []);

  // Programa del DJ: el que le toca a su hora (o el que elija para emitir fuera de horario).
  const programRef = useRef<StudioProgram | null>(null);
  const metaFor = useCallback((it: QueueItem) => ({ title: it.title, artist: it.artist || programRef.current?.name || "" }), []);

  const getEngine = useCallback((): AudioEngine => {
    if (engineRef.current) return engineRef.current;
    const e = new AudioEngine();
    e.setMasterVolume(0.9);
    const v = voiceRef.current; // lo que el DJ ya ajustó antes de que existiera el motor
    e.setDuck(v.duck);
    e.setEq("music", v.eqMusic);
    e.setEq("mic", v.eqMic);
    e.setMicGain(v.micGain);
    e.setMicMuted(v.micMuted);
    e.setMicGateThreshold(v.gateDb);
    e.onCartEnded = (id) =>
      setCartsPlaying((s) => {
        if (!s.has(id)) return s;
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    e.onMicLost = () => {
      setMicActive(false);
      setMicError("Se perdió el micrófono (¿se desconectó?). Actívalo de nuevo.");
    };
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
          attachCover(to, item);
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
        senderRef.current?.setMetadata(metaFor(item));
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
  }, [attachCover, metaFor]);

  // Los medidores consultan el motor por su cuenta (PollMeter): la consola no se re-renderiza por ellos.
  const levelsRef = useRef({ at: 0, value: { master: { rmsDb: -100, peakDb: -100 }, A: -100, B: -100 } });
  const readLevels = useCallback(() => {
    const e = engineRef.current;
    const now = performance.now();
    if (e && now - levelsRef.current.at > 30) levelsRef.current = { at: now, value: e.getLevels() };
    return levelsRef.current.value;
  }, []);
  const readMaster = useCallback(() => readLevels().master.peakDb, [readLevels]);
  const readDeckA = useCallback(() => readLevels().A, [readLevels]);
  const readDeckB = useCallback(() => readLevels().B, [readLevels]);

  // Evita que soltar un archivo fuera de la cola haga que el navegador lo abra y se pierda la sesión.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  // Pantalla encendida mientras se transmite (si el navegador lo permite).
  useEffect(() => {
    if (live !== "live" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!lock || lock.released)) acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [live]);

  // La consola ocupa el alto de la pantalla: solo la cola y la biblioteca hacen scroll.
  useEffect(() => {
    const fit = () => {
      const el = rootRef.current;
      if (!el) return;
      if (window.innerWidth < 1024) {
        el.style.height = "";
        return;
      }
      const pad = (parseFloat(getComputedStyle(el.parentElement ?? el).paddingBottom) || 0) + (parseFloat(getComputedStyle(document.body).paddingBottom) || 0); // relleno del contenedor + espacio del reproductor fijo
      const bleed = 20; // el margen negativo de .studio compensa parte del relleno del contenedor
      el.style.height = `${Math.max(760, window.innerHeight - el.getBoundingClientRect().top - pad + bleed)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const djUser = creds.user.trim().toLowerCase();
  useEffect(() => {
    if (!/^[a-z0-9_.-]{2,50}$/.test(djUser)) return;
    let alive = true;
    const load = () =>
      fetch(`/api/studio/my-program?dj=${encodeURIComponent(djUser)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: DjProgramInfo | null) => alive && setDjInfo(d))
        .catch(() => undefined);
    const first = setTimeout(load, 500); // espera a que termine de escribir el usuario
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(t);
    };
  }, [djUser]);

  const activeProgram: StudioProgram | null = useMemo(() => {
    if (!djInfo) return null;
    if (programChoice) return [...(djInfo.scheduled ? [djInfo.scheduled.program] : []), ...djInfo.others].find((p) => p.id === programChoice) ?? null;
    return djInfo.scheduled?.program ?? null;
  }, [djInfo, programChoice]);

  // Si cambia el programa mientras se emite, se actualiza lo que ve el público.
  useEffect(() => {
    programRef.current = activeProgram;
    if (liveRef.current !== "live") return;
    const it = engineRef.current?.deckItem(activeRef.current);
    if (it) senderRef.current?.setMetadata(metaFor(it));
  }, [activeProgram, metaFor]);

  // Historial: una entrada por cada pista que pasa al aire mientras se está EN VIVO.
  useEffect(() => {
    if (live !== "live") {
      loggedRef.current = null;
      return;
    }
    const d = decks[active];
    const it = d.item;
    if (!it || !d.playing || loggedRef.current === it.id) return;
    loggedRef.current = it.id;
    void fetch("/api/studio/history", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: it.title, artist: it.artist, source: it.source === "azuracast" ? "azuracast" : "local", djName: creds.user || undefined }),
    }).catch(() => undefined);
  }, [live, active, decks, creds.user]);

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
      coversRef.current.A?.revoke();
      coversRef.current.B?.revoke();
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
        attachCover(id, item);
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
    [getEngine, attachCover],
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
        if (item) senderRef.current?.setMetadata(metaFor(item));
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "No se pudo reproducir.");
      }
    },
    [getEngine, metaFor],
  );

  const pause = useCallback(
    (id: DeckId) => {
      engineRef.current?.pause(id);
      setDecks((d) => ({ ...d, [id]: { ...d[id], playing: false } }));
    },
    [],
  );

  const startMic = useCallback(async () => {
    try {
      setMicError(null);
      const e = getEngine();
      await e.resume();
      await e.startMic(deviceId || undefined);
      setMicActive(true);
      setDevices(await e.listMics()); // las etiquetas solo existen tras conceder el permiso
    } catch (err) {
      setMicActive(false);
      setMicError(err instanceof Error ? err.message : "No se pudo abrir el micrófono.");
    }
  }, [deviceId, getEngine]);

  const stopMic = useCallback(() => {
    engineRef.current?.stopMic();
    setMicActive(false);
  }, []);

  // Mantener V para hablar mientras el micrófono está silenciado.
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== "KeyV" || e.repeat || isTyping(e.target)) return;
      const eng = engineRef.current;
      if (!eng?.micActive || !voiceRef.current.micMuted) return;
      pttRef.current = true;
      eng.setMicMuted(false);
      setMicMuted(false);
    };
    const release = () => {
      if (!pttRef.current) return;
      pttRef.current = false;
      engineRef.current?.setMicMuted(true);
      setMicMuted(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "KeyV") release();
    };
    // Si la ventana pierde el foco con V pulsada, el «keyup» nunca llega: el micrófono no puede quedar abierto al aire.
    const hide = () => {
      if (document.visibilityState === "hidden") release();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);

  // Cart Wall: se cargan los audios y se decodifican de antemano para dispararlos al instante.
  useEffect(() => {
    let alive = true;
    fetch("/api/studio/carts")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as CartView[];
      })
      .then((list) => {
        if (!alive) return;
        setCarts(list);
        setCartState("ready");
        const e = getEngine();
        for (const c of list) void e.preloadCart(c.id, `/api/studio/cart/${c.id}`).catch(() => undefined);
      })
      .catch(() => alive && setCartState("error"));
    return () => {
      alive = false;
    };
  }, [getEngine]);

  const fireCart = useCallback(
    async (c: CartView) => {
      try {
        const e = getEngine();
        await e.resume();
        if (!e.hasCart(c.id)) await e.preloadCart(c.id, `/api/studio/cart/${c.id}`);
        if (e.playCart(c.id, { gainDb: c.gainDb, duck: c.duck })) {
          setCartsPlaying((s) => new Set(s).add(c.id));
          if (liveRef.current === "live") {
            void fetch("/api/studio/history", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ title: c.name, artist: "", source: "cart", djName: djRef.current || undefined }),
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "No se pudo reproducir el cart.");
      }
    },
    [getEngine],
  );

  const stopCarts = useCallback(() => engineRef.current?.stopAllCarts(), []);
  const readCartRemaining = useCallback((id: string) => engineRef.current?.cartRemaining(id) ?? 0, []);

  // Atajos de los carts (1 tecla) y Esc para detenerlos todos.
  useEffect(() => {
    const keys = hotkeyMap(carts);
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.key === "Escape") {
        engineRef.current?.stopAllCarts();
        return;
      }
      if (e.repeat) return;
      const id = keys.get(e.key.toLowerCase());
      const cart = id ? carts.find((c) => c.id === id) : undefined;
      if (cart) {
        e.preventDefault();
        void fireCart(cart);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [carts, fireCart]);

  const readMicLevel = useCallback(() => engineRef.current?.getMicLevelDb() ?? -100, []);
  const readDuckDb = useCallback(() => engineRef.current?.getDuckGainDb() ?? 0, []);

  const toggleLive = useCallback(async () => {
    if (live === "live" || live === "connecting" || live === "reconnecting") {
      senderRef.current?.stop();
      senderRef.current = null;
      liveSinceRef.current = null;
      setElapsed(0);
      return;
    }
    if (senderRef.current || startingRef.current) return; // doble clic: ya hay una conexión en curso
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(WEBCAST_MIME)) {
      setMessage("Este navegador no puede emitir en vivo. Usa Chrome, Edge o Firefox actualizados.");
      return;
    }
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
      if (item) sender.setMetadata(metaFor(item));
      sender.start();
    } catch (err) {
      senderRef.current = null;
      setMessage(err instanceof Error ? err.message : "No se pudo iniciar la emisión.");
    } finally {
      startingRef.current = false;
    }
  }, [live, creds, getEngine, metaFor]);

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
    <div ref={rootRef} className="studio">
      <LiveBar
        state={live}
        user={creds.user}
        password={creds.password}
        onUser={(user) => setEdits((c) => ({ ...c, user }))}
        onPassword={(password) => setEdits((c) => ({ ...c, password }))}
        onToggle={() => void toggleLive()}
        elapsedSec={elapsed}
        readMaster={readMaster}
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
        dj={/^[a-z0-9_.-]{2,50}$/.test(djUser) ? djInfo : null}
        programChoice={programChoice}
        onProgramChoice={setProgramChoice}
      />
      <div className="studio-decks">
        {(["A", "B"] as const).map((id) => (
          <DeckPanel
            key={id}
            id={id}
            deck={decks[id]}
            active={active === id}
            readLevel={id === "A" ? readDeckA : readDeckB}
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
      <div className="studio-bottom">
      <QueuePanel
        queue={queue}
        rejected={rejected}
        onAir={decks[active].playing ? active : null}
        auto={auto}
        onAuto={setAuto}
        onAddFiles={addFiles}
        onAddItems={(items) => dispatch({ type: "add", items })}
        onMove={(from, to) => dispatch({ type: "move", from, to })}
        onRemove={(id) => dispatch({ type: "remove", id })}
        onClear={() => dispatch({ type: "clear" })}
        onLoad={(item, id) => void loadToDeck(item, id)}
      />
      <LibraryPanel onAdd={(items) => dispatch({ type: "add", items })} queue={queue} />
        <section className="studio-tools panel" aria-label="Herramientas">
          <div role="tablist" aria-label="Herramientas del estudio" className="studio-tabs">
            {([
              ["carts", "Cart Wall", cartsPlaying.size > 0],
              ["voice", "Voz", micActive && !micMuted],
              ["eq", "Ecualizador", false],
            ] as const).map(([k, label, hot]) => (
              <button key={k} type="button" role="tab" id={`tool-tab-${k}`} aria-selected={tool === k} aria-controls={`tool-${k}`} className="studio-tab" data-hot={hot} onClick={() => setTool(k)}>
                {label}
              </button>
            ))}
          </div>
          <div id="tool-carts" role="tabpanel" aria-labelledby="tool-tab-carts" className="studio-tool-body" hidden={tool !== "carts"}>
            <CartWall carts={carts} state={cartState} playing={cartsPlaying} onFire={(c) => void fireCart(c)} onStopAll={stopCarts} readRemaining={readCartRemaining} />
          </div>
          <div id="tool-voice" role="tabpanel" aria-labelledby="tool-tab-voice" className="studio-tool-body grid content-start gap-4" hidden={tool !== "voice"}>
            <MicPanel
              active={micActive}
              muted={micMuted}
              gain={micGain}
              gateDb={gateDb}
              devices={devices}
              deviceId={deviceId}
              error={micError}
              readLevel={readMicLevel}
              onStart={() => void startMic()}
              onStop={stopMic}
              onMuted={(m) => {
                setMicMuted(m);
                engineRef.current?.setMicMuted(m);
              }}
              onGain={(g) => {
                setMicGain(g);
                engineRef.current?.setMicGain(g);
              }}
              onGate={(db) => {
                setGateDb(db);
                engineRef.current?.setMicGateThreshold(db);
              }}
              onDevice={setDeviceId}
            />
            <DuckingPanel
              settings={duck}
              onChange={(d) => {
                setDuck(d);
                engineRef.current?.setDuck(d);
              }}
              onForce={(on) => engineRef.current?.setDuckForced(on)}
              readDuckDb={readDuckDb}
            />
          </div>
          <div id="tool-eq" role="tabpanel" aria-labelledby="tool-tab-eq" className="studio-tool-body" hidden={tool !== "eq"}>
            <EqPanel
              music={eqMusic}
              mic={eqMic}
              onMusic={(e) => {
                setEqMusic(e);
                engineRef.current?.setEq("music", e);
              }}
              onMic={(e) => {
                setEqMic(e);
                engineRef.current?.setEq("mic", e);
              }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
