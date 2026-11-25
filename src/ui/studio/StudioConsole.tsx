"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { DeckView } from "./DeckPanel";
import { LibraryPanel } from "./LibraryPanel";
import type { DjProgramInfo, StudioProgram } from "@/modules/schedule/dj";
import type { CartView } from "@/modules/studio/carts";
import { SpotifyPanel } from "./SpotifyPanel";
import { EventsPanel } from "./EventsPanel";
import { useStudioEvents } from "./useStudioEvents";
import type { EventView } from "@/modules/studio/events";
import { JingleBar } from "./JingleBar";
import { PrincipalPanel } from "./PrincipalPanel";
import { StatusBar } from "./StatusBar";
import { StudioToolbar, type ToolId } from "./StudioToolbar";
import { ZaraWindow } from "./ZaraWindow";
import { DuckingPanel } from "./DuckingPanel";
import { EqPanel } from "./EqPanel";
import type { RelayTrack } from "@/modules/studio/relay-meta";
import { RelayPanel } from "./RelayPanel";
import { ChatModPanel, RequestsPanel, useDeskFeed } from "./DeskChat";
import { liveStore } from "./live-store";
import { LiveBar } from "./LiveBar";
import { LinePanel } from "./LinePanel";
import { MidiPanel } from "./MidiPanel";
import { useMidi } from "./useMidi";
import type { MidiEvent } from "./engine/midi";
import { DEFAULT_PTT, PTT_KEY, parsePtt, pttLabel } from "./engine/ptt";
import { MicPanel, type MicDevice } from "./MicPanel";
import { AudioEngine, LoadSupersededError, type DeckId, type Levels, type RelayState } from "./engine/audio-engine";
import { makeItems } from "./engine/audio-files";
import { hotkeyMap, isTypingTarget } from "./engine/carts";
import { loadCover, type DeckCover } from "./engine/deck-cover";
import { FLAT_EQ, type EqSettings } from "./engine/eq";
import { DEFAULT_DUCK, type DuckSettings } from "./engine/voice";
import { pickNext, shouldAdvanceOnEnd, shouldStartFade } from "./engine/autoplay";
import { dueOccurrences, eventAction, eventToQueue, nextOccurrence } from "./engine/scheduler";
import { DjGate, type DjEntry } from "./DjGate";
import { CabinCamera } from "./CabinCamera";
import { queueReducer, type QueueItem } from "./engine/queue";
import { WEBCAST_MIME, WEBCAST_URL, WebcastSender, type LiveState, type RecorderLike, type SocketLike } from "./engine/webcast";

const FADE_SEC = 6;
const CREDS_KEY = "sf-studio-dj";
const other = (d: DeckId): DeckId => (d === "A" ? "B" : "A");
const emptyDeck = (): DeckView => ({ item: null, durationSec: null, currentSec: 0, playing: false, volume: 1, coverUrl: null, spent: false });

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
export type RelayInfo = { configured: boolean; name: string };

export function StudioConsole({ relay, visible = true, locutor }: { relay: RelayInfo; visible?: boolean; locutor?: string }) {
  const [picked, setPicked] = useState<DjEntry | null>(null);
  // Un locutor ya inició sesión en el panel: no hay segunda entrada, su acceso a AzuraCast lo da el servidor en su horario.
  const own = useMemo<DjEntry | null>(() => (locutor ? { user: locutor, password: "", programChoice: "" } : null), [locutor]);
  const entry = own ?? picked;
  if (!entry) return <DjGate onEnter={setPicked} />;
  return <StudioConsoleInner entry={entry} relay={relay} visible={visible} locked={Boolean(locutor)} />;
}

/** Acceso a AzuraCast de un locutor: el servidor solo lo entrega dentro de su horario. */
async function fetchDjCredentials(): Promise<Creds> {
  const res = await fetch("/api/studio/dj-credentials", { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: string; user?: string; password?: string };
  if (!res.ok || !body.user || !body.password) throw new Error(body.error ?? "No se pudo obtener tu acceso al estudio.");
  return { user: body.user, password: body.password };
}

const FIRED_KEY = "sf-studio-fired";
const SCHED_KEY = "sf-studio-scheduler";

/** Eventos ya disparados hoy en esta pestaña (sobreviven a recargar, para no repetir un evento Fijo dentro de su margen). */
function readFired(): Set<string> {
  try {
    const v = JSON.parse(sessionStorage.getItem(FIRED_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((k): k is string => typeof k === "string").slice(-200) : []);
  } catch {
    return new Set();
  }
}

function StudioConsoleInner({ entry, relay, visible, locked }: { entry: DjEntry; relay: RelayInfo; visible: boolean; locked: boolean }) {
  const visibleRef = useRef(visible);
  useEffect(() => {
    visibleRef.current = visible; // los atajos del teclado solo valen con la consola a la vista
  }, [visible]);
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
  const monitorRef = useRef(true);
  const masterRef = useRef(0.9);
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
  const [tool, setTool] = useState<ToolId | null>(null);
  const [cabinLive, setCabinLive] = useState(false);
  const [searchSeed, setSearchSeed] = useState<{ text: string; n: number } | null>(null);
  const [spSeed, setSpSeed] = useState<{ text: string; n: number } | null>(null);
  // Entrada de consola o mezclador externo del DJ.
  const [lineOn, setLineOn] = useState(false);
  const [lineVol, setLineVol] = useState(1);
  const [lineDevices, setLineDevices] = useState<MicDevice[]>([]);
  const [lineDeviceId, setLineDeviceId] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const lineVolRef = useRef(1);
  const [extOn, setExtOn] = useState(false);
  const [extVol, setExtVol] = useState(1);
  const [spFollow, setSpFollow] = useState(true);
  const spFollowRef = useRef(true);
  const extVolRef = useRef(1);
  const resumeRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    spFollowRef.current = spFollow;
    extVolRef.current = extVol;
  });
  const desk = useDeskFeed(visible);
  // Programador de eventos: se leen de la base y los dispara esta consola mientras se emite en vivo.
  const eventsApi = useStudioEvents(visible);
  const [schedulerOn, setSchedulerOn] = useState(true);
  const [firedKeys, setFiredKeys] = useState<ReadonlySet<string>>(() => readFired());
  const firedRef = useRef<Set<string>>(new Set(firedKeys));
  const eventsRef = useRef<EventView[]>([]);
  const cartsRef = useRef<CartView[]>([]);
  const [relayState, setRelayState] = useState<RelayState>("idle");
  const [relayVolume, setRelayVolume] = useState(0.8);
  const [relayTrack, setRelayTrack] = useState<RelayTrack | null>(null);
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
  /** Pasa a la siguiente pista (con fundido o en seco); lo asigna el motor al crearse. */
  const nextRef = useRef<(mode: "fade" | "cut") => Promise<void>>(async () => undefined);
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
    lineVolRef.current = lineVol;
  }, [lineVol]);
  useEffect(() => {
    eventsRef.current = eventsApi.events;
    cartsRef.current = carts;
  }, [eventsApi.events, carts]);
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
    e.setMasterVolume(masterRef.current);
    e.setMonitor(monitorRef.current); // lo que el DJ eligió antes de que existiera el motor
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
    e.onRelayState = setRelayState;
    e.onExternalLost = () => setExtOn(false);
    e.onLineLost = () => {
      setLineOn(false);
      setLineError("Se perdió la entrada de la consola (¿se desconectó el aparato?). Conéctala de nuevo.");
    };
    e.onExternalIdle = () => {
      if (spFollowRef.current) void resumeRef.current?.();
    };
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
      setDecks((d) => ({ ...d, [from]: { ...d[from], spent: true } }));
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
        setDecks((d) => ({ ...d, [to]: { ...d[to], spent: false } }));
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
        if (mode === "fade") {
          handedOffRef.current[from] = false; // la saliente sigue siendo la dueña del aire
          setDecks((d) => ({ ...d, [from]: { ...d[from], spent: false } }));
        }
        if (!(err instanceof LoadSupersededError)) {
          setMessage(err instanceof Error ? err.message : "No se pudo pasar a la siguiente pista.");
        }
      } finally {
        fadingRef.current = false;
      }
    };
    nextRef.current = (mode) => startNext(activeRef.current, mode);
    e.onDeckEnded = (id) => {
      setDecks((d) => ({ ...d, [id]: { ...d[id], playing: false, spent: true } }));
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

  // Oír la salida en este equipo: se recuerda; en teléfonos arranca en silencio (así no se oye doble con el reproductor del sitio).
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("sf-studio-monitor");
    } catch {
      /* sin almacenamiento */
    }
    const on = saved === null ? window.innerWidth >= 768 : saved === "1";
    monitorRef.current = on;
    setMonitor(on); // eslint-disable-line react-hooks/set-state-in-effect -- preferencia guardada solo en el navegador
    engineRef.current?.setMonitor(on);
  }, []);
  const changeMonitor = useCallback((on: boolean) => {
    monitorRef.current = on;
    setMonitor(on);
    engineRef.current?.setMonitor(on);
    try {
      localStorage.setItem("sf-studio-monitor", on ? "1" : "0");
    } catch {
      /* solo vale para esta visita */
    }
  }, []);

  // Los medidores consultan el motor por su cuenta (PollMeter): la consola no se re-renderiza por ellos.
  const levelsRef = useRef({ at: 0, value: { master: { rmsDb: -100, peakDb: -100 }, A: -100, B: -100, stereo: { A: [-100, -100], B: [-100, -100] } } as Levels });
  const readLevels = useCallback(() => {
    const e = engineRef.current;
    const now = performance.now();
    if (e && now - levelsRef.current.at > 30) levelsRef.current = { at: now, value: e.getLevels() };
    return levelsRef.current.value;
  }, []);
  const readMaster = useCallback(() => readLevels().master.peakDb, [readLevels]);
  const readLR = useCallback((id: DeckId, ch: 0 | 1) => readLevels().stereo[id][ch], [readLevels]);

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
      if (window.innerWidth < 1280) {
        el.style.height = ""; // con menos de tres columnas la consola crece con la página
        return;
      }
      const pad = (parseFloat(getComputedStyle(el.parentElement ?? el).paddingBottom) || 0) + (parseFloat(getComputedStyle(document.body).paddingBottom) || 0); // relleno del contenedor + espacio del reproductor fijo
      const gap = 8; // respiro bajo la barra de estado (la última fila de la consola debe verse completa)
      el.style.height = `${Math.max(760, window.innerHeight - el.getBoundingClientRect().top - pad - gap)}px`;
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
        setDecks((d) => ({ ...d, [id]: { ...d[id], item, durationSec, currentSec: 0, playing: false, spent: false } }));
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
        setDecks((d) => ({ ...d, [id]: { ...d[id], playing: true, spent: false } }));
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

  /* ───────────── Transporte de la lista principal (estilo ZaraStudio) ───────────── */

  /** Play: reanuda lo cargado en el deck activo; si no hay nada, arranca la cabeza de la cola. */
  const playMain = useCallback(async () => {
    const e = getEngine();
    const id = activeRef.current;
    if (e.isPlaying(id)) return;
    if (e.deckItem(id)) return play(id);
    if (e.deckItem(other(id)) && !handedOffRef.current[other(id)]) return play(other(id));
    const head = queueRef.current[0];
    if (!head) {
      setMessage("La lista está vacía: añade pistas desde el explorador.");
      return;
    }
    await loadToDeck(head, id);
    await play(id);
  }, [getEngine, play, loadToDeck]);

  /** Stop: detiene el deck activo y lo deja al principio de su pista. */
  const stopMain = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const id = activeRef.current;
    pause(id);
    e.seek(id, 0);
    setDecks((d) => ({ ...d, [id]: { ...d[id], currentSec: 0 } }));
  }, [pause]);

  const restartMain = useCallback(() => {
    const e = engineRef.current;
    const id = activeRef.current;
    if (!e?.deckItem(id)) return;
    e.seek(id, 0);
    setDecks((d) => ({ ...d, [id]: { ...d[id], currentSec: 0 } }));
  }, []);

  /** Siguiente pista con fundido o en seco. Avisa si no hay otra. */
  const skipMain = useCallback(
    async (mode: "fade" | "cut") => {
      const e = engineRef.current;
      if (!e) return;
      const to = other(activeRef.current);
      const pick = pickNext({ queue: queueRef.current, otherDeckItem: e.deckItem(to), otherDeckPlaying: e.isPlaying(to), otherDeckConsumed: handedOffRef.current[to] });
      if (!pick) {
        setMessage("No hay otra pista en la lista.");
        return;
      }
      setMessage(null);
      await nextRef.current(mode);
    },
    [],
  );

  /** Reproduce ya una pista de la lista (doble clic): con fundido si algo está sonando, directa si no. */
  const playItemNow = useCallback(
    async (item: QueueItem) => {
      const e = getEngine();
      const from = activeRef.current;
      const busy = e.isPlaying(from);
      const to = busy ? other(from) : from;
      if (busy && e.isPlaying(to)) {
        setMessage("Los dos decks están sonando: espera a que termine el fundido.");
        return;
      }
      fadingRef.current = true;
      try {
        await loadToDeck(item, to);
        if (busy) {
          handedOffRef.current[from] = true;
          handedOffRef.current[to] = false;
          setDecks((d) => ({ ...d, [from]: { ...d[from], spent: true } }));
          await e.crossfadeTo(to, FADE_SEC);
          setDecks((d) => ({ ...d, [to]: { ...d[to], playing: true } }));
          activeRef.current = to;
          setActive(to);
          senderRef.current?.setMetadata(metaFor(item));
        } else {
          await play(to);
        }
      } catch (err) {
        if (busy) {
          handedOffRef.current[from] = false;
          setDecks((d) => ({ ...d, [from]: { ...d[from], spent: false } }));
        }
        if (!(err instanceof LoadSupersededError)) setMessage(err instanceof Error ? err.message : "No se pudo reproducir la pista.");
      } finally {
        fadingRef.current = false;
      }
    },
    [getEngine, loadToDeck, play, metaFor],
  );

  /* ───────────── Programador de eventos ───────────── */

  /**
   * Dispara uno o varios eventos: sus audios pasan al frente de la lista y la consola actúa según cómo entran. Con nada sonando
   * arrancan ya; «Fijo» salta al primer audio (con fundido o en seco); «Retardado» queda al frente y entra al terminar la pista.
   */
  const fireEvents = useCallback(
    async (evs: EventView[]) => {
      const e = getEngine();
      const all: QueueItem[] = [];
      const missing: string[] = [];
      for (const ev of evs) {
        const r = eventToQueue(ev.items, cartsRef.current, () => crypto.randomUUID());
        all.push(...r.items);
        missing.push(...r.missing);
      }
      if (missing.length) setMessage(`Faltan jingles que ya no existen en el Cart Wall: ${missing.join(", ")}.`);
      if (all.length === 0) {
        if (!missing.length) setMessage("El evento no tiene audios que se puedan reproducir.");
        return;
      }
      queueRef.current = [...all, ...queueRef.current]; // ya visible para el motor; el reductor deja lo mismo
      dispatch({ type: "prepend", items: all });
      const playing = e.isPlaying("A") || e.isPlaying("B");
      const actions = evs.map((ev) => eventAction({ mode: ev.mode, transition: ev.transition, playing }));
      const action = actions.includes("skip-cut") ? "skip-cut" : actions.includes("skip-fade") ? "skip-fade" : actions.includes("start") ? "start" : "wait";
      if (action === "start") await playMain();
      else if (action === "skip-cut") await skipMain("cut");
      else if (action === "skip-fade") await skipMain("fade");
      else if (!autoRef.current) setMessage(`«${evs[0].name}» queda en espera: pulsa «Siguiente» o activa Auto para que entre.`);
    },
    [getEngine, playMain, skipMain],
  );

  // Cada segundo: ¿algún evento ya le toca? Solo con la emisión EN VIVO y el programador activo.
  useEffect(() => {
    if (!schedulerOn) return;
    const tick = () => {
      if (liveRef.current !== "live") return;
      const due = dueOccurrences(eventsRef.current, Date.now(), firedRef.current);
      if (due.length === 0) return;
      for (const o of due) firedRef.current.add(o.key);
      const keys = [...firedRef.current].slice(-200);
      setFiredKeys(new Set(keys));
      try {
        sessionStorage.setItem(FIRED_KEY, JSON.stringify(keys));
      } catch {
        /* sin almacenamiento: al recargar, el margen de gracia basta para no repetirlos casi nunca */
      }
      void fireEvents(due.map((o) => o.event as EventView));
    };
    const t = setInterval(tick, 1000);
    tick();
    return () => clearInterval(t);
  }, [schedulerOn, fireEvents]);

  // El programador pausado o activo se recuerda en este navegador.
  useEffect(() => {
    try {
      if (localStorage.getItem(SCHED_KEY) === "0") setSchedulerOn(false); // eslint-disable-line react-hooks/set-state-in-effect -- preferencia guardada solo en el navegador
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const changeScheduler = useCallback((on: boolean) => {
    setSchedulerOn(on);
    try {
      localStorage.setItem(SCHED_KEY, on ? "1" : "0");
    } catch {
      /* solo vale para esta visita */
    }
  }, []);

  /** Conecta la entrada de la consola o mezclador del DJ a la emisión. */
  const startLine = useCallback(async () => {
    try {
      setLineError(null);
      const e = getEngine();
      await e.resume();
      await e.startLine(lineDeviceId || undefined, lineVolRef.current);
      setLineOn(true);
      setLineDevices(await e.listMics()); // las etiquetas solo existen tras conceder el permiso
    } catch (err) {
      setLineOn(false);
      const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
      const missing = err instanceof DOMException && (err.name === "NotFoundError" || err.name === "OverconstrainedError");
      setLineError(denied ? "El navegador no dejó usar la entrada de audio. Permítela en el candado de la barra de direcciones." : missing ? "No se encontró esa entrada de audio. Revisa que el aparato esté conectado." : err instanceof Error ? err.message : "No se pudo abrir la entrada.");
    }
  }, [lineDeviceId, getEngine]);
  const stopLine = useCallback(() => {
    engineRef.current?.stopLine();
    setLineOn(false);
  }, []);
  const changeLineVolume = useCallback((v: number) => {
    setLineVol(v);
    engineRef.current?.setLineVolume(v);
  }, []);
  const readLine = useCallback(() => engineRef.current?.lineLevelDb() ?? -100, []);
  const midiActionRef = useRef<(ev: MidiEvent) => void>(() => undefined);
  const midi = useMidi((ev) => midiActionRef.current(ev));
  // Las entradas disponibles se actualizan al conectar o desconectar un aparato.
  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const refresh = () => void getEngine().listMics().then(setLineDevices).catch(() => undefined);
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [getEngine]);

  const startMic = useCallback(async () => {
    try {
      setMicError(null);
      const e = getEngine();
      await e.resume();
      await e.startMic(deviceId || undefined);
      // Encender el micrófono lo deja abierto, aunque antes se hubiera silenciado.
      e.setMicMuted(false);
      setMicMuted(false);
      setMicActive(true);
      setDevices(await e.listMics()); // las etiquetas solo existen tras conceder el permiso
    } catch (err) {
      setMicActive(false);
      setMicError(err instanceof Error ? err.message : "No se pudo abrir el micrófono.");
    }
  }, [deviceId, getEngine]);

  // Mientras la señal externa está en la mezcla se consulta qué canción suena (cada 15 s).
  useEffect(() => {
    if (relayState !== "playing" || !relay.configured) return;
    let alive = true;
    const load = () =>
      fetch("/api/studio/relay/meta")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { track: RelayTrack | null } | null) => alive && setRelayTrack(d?.track ?? null))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
      setRelayTrack(null);
    };
  }, [relayState, relay.configured]);

  // En directo y sin música sonando en los decks, quien escucha ve la canción de la señal.
  useEffect(() => {
    if (!relayTrack || liveRef.current !== "live") return;
    const deckBusy = (["A", "B"] as const).some((id) => engineRef.current?.isPlaying(id));
    if (!deckBusy) senderRef.current?.setMetadata({ title: relayTrack.title, artist: relayTrack.artist || relay.name });
  }, [relayTrack, relay.name]);

  // Si suena Spotify es porque hay un programa en vivo: quien escucha ve el nombre del programa (y su imagen, que sale de la
  // parrilla), no el de una canción. Al quitar Spotify del aire no se deja ese título si no hay música en los decks.
  const programName = activeProgram?.name ?? null;
  const spotifyPushed = useRef(false);
  useEffect(() => {
    const sender = senderRef.current;
    if ((extOn || lineOn) && live === "live") {
      spotifyPushed.current = true;
      sender?.setMetadata({ title: programName ?? "En vivo", artist: "" });
    } else if (!extOn && !lineOn && spotifyPushed.current) {
      spotifyPushed.current = false;
      const deckBusy = (["A", "B"] as const).some((id) => engineRef.current?.isPlaying(id));
      if (live === "live" && !deckBusy) sender?.setMetadata({ title: programName ?? "En vivo", artist: "" });
    }
  }, [extOn, lineOn, live, programName]);

  const toggleRelay = useCallback(async () => {
    const e = getEngine();
    if (relayState === "playing" || relayState === "connecting") {
      e.stopRelay();
      return;
    }
    e.setRelayVolume(relayVolume);
    await e.startRelay();
    // En directo, quien escucha ve de qué señal se trata mientras no suene una pista.
    if (liveRef.current === "live") senderRef.current?.setMetadata({ title: relay.name, artist: "" });
  }, [getEngine, relayState, relayVolume, relay.name]);

  const stopMic = useCallback(() => {
    engineRef.current?.stopMic();
    setMicActive(false);
  }, []);

  // Tecla para hablar elegida por el DJ (se guarda en este navegador).
  const [pttCode, setPttCode] = useState(DEFAULT_PTT);
  const pttCodeRef = useRef(DEFAULT_PTT);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const c = parsePtt(localStorage.getItem(PTT_KEY));
        pttCodeRef.current = c;
        setPttCode(c);
      } catch {
        /* sin almacenamiento: queda la V */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const changePttCode = useCallback((code: string) => {
    pttCodeRef.current = code;
    setPttCode(code);
    try {
      localStorage.setItem(PTT_KEY, code);
    } catch {
      /* vale solo para esta visita */
    }
  }, []);

  /**
   * Hablar mientras se mantiene la tecla (o el botón del aparato MIDI): abre el micrófono —y lo enciende si aún no lo estaba— y al
   * soltar lo vuelve a silenciar. Si ya estaba abierto con el botón, no se toca.
   */
  const holdTalk = useCallback(
    (press: boolean) => {
      const eng = engineRef.current;
      if (press) {
        if (pttRef.current) return;
        if (eng?.micActive && !voiceRef.current.micMuted) return; // ya está abierto
        pttRef.current = true;
        if (eng?.micActive) {
          eng.setMicMuted(false);
          setMicMuted(false);
        } else {
          void startMic().then(() => {
            // Si soltó la tecla mientras el navegador pedía el micrófono, no debe quedar abierto.
            if (!pttRef.current) {
              engineRef.current?.setMicMuted(true);
              setMicMuted(true);
            }
          });
        }
      } else if (pttRef.current) {
        pttRef.current = false;
        eng?.setMicMuted(true);
        setMicMuted(true);
      }
    },
    [startMic],
  );
  const holdTalkRef = useRef(holdTalk);
  useEffect(() => {
    holdTalkRef.current = holdTalk;
  });

  /** Botón del micrófono: enciende (abierto) o apaga (silenciado); el aparato queda listo para hablar al instante. */
  const toggleMic = useCallback(() => {
    if (!engineRef.current?.micActive) {
      void startMic();
      return;
    }
    const m = !voiceRef.current.micMuted;
    pttRef.current = false;
    setMicMuted(m);
    engineRef.current.setMicMuted(m);
  }, [startMic]);

  // Mantener la tecla elegida para hablar (por defecto V).
  useEffect(() => {
    const isTyping = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (!visibleRef.current || e.code !== pttCodeRef.current || e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest("[data-ptt-capture]")) return; // eligiendo la tecla
      e.preventDefault();
      holdTalkRef.current(true);
    };
    const release = () => holdTalkRef.current(false);
    const up = (e: KeyboardEvent) => {
      if (e.code === pttCodeRef.current) release();
    };
    // Si la ventana pierde el foco con la tecla pulsada, el «keyup» nunca llega: el micrófono no puede quedar abierto al aire.
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
    if (!visible) return; // al volver a la consola se recarga (por si se subió un jingle mientras tanto)
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
        for (const c of list) if (!e.hasCart(c.id)) void e.preloadCart(c.id, `/api/studio/cart/${c.id}`).catch(() => undefined);
      })
      .catch(() => alive && setCartState("error"));
    return () => {
      alive = false;
    };
  }, [getEngine, visible]);

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

  /** Al terminar el audio de Spotify del DJ: si ningún deck suena y «siguiente automática» está activa, arranca la siguiente pista de la cola. */
  const resumeQueueAfterVideo = useCallback(async () => {
    const e = engineRef.current;
    if (!e || !autoRef.current) return;
    if (e.isPlaying("A") || e.isPlaying("B")) return; // el aire ya tiene música: no se pisa
    const next = queueRef.current[0];
    if (!next) return;
    const id = activeRef.current;
    await loadToDeck(next, id);
    await play(id);
  }, [loadToDeck, play]);
  useEffect(() => {
    resumeRef.current = resumeQueueAfterVideo;
  });

  /** Comparte la pestaña de Spotify (con su audio) y la mezcla en la emisión. La pestaña queda en silencio para el locutor. */
  const shareExternal = useCallback(async () => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getDisplayMedia) throw new Error("Este navegador no permite compartir el audio de una pestaña. Usa Chrome o Edge.");
    const e = getEngine();
    await e.resume();
    let stream: MediaStream;
    try {
      stream = await md.getDisplayMedia({
        video: { frameRate: 1 },
        audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        // Solo pestañas, y nunca la del propio estudio (se oiría a sí mismo).
        selfBrowserSurface: "exclude",
        preferCurrentTab: false,
        surfaceSwitching: "exclude",
        systemAudio: "exclude",
        monitorTypeSurfaces: "exclude",
      } as unknown as DisplayMediaStreamOptions);
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError")) return; // cerró el selector
      throw new Error("No se pudo compartir la pestaña. Inténtalo de nuevo.");
    }
    if (stream.getAudioTracks().length === 0) {
      for (const t of stream.getTracks()) t.stop();
      throw new Error("No se compartió el audio. Vuelve a intentarlo, elige la pestaña del video y marca «Compartir audio de la pestaña».");
    }
    e.attachExternalStream(stream, extVolRef.current);
    setExtOn(true);
  }, [getEngine]);
  const stopExternal = useCallback(() => {
    engineRef.current?.stopExternal();
    setExtOn(false);
  }, []);
  const changeExtVolume = useCallback((v: number) => {
    setExtVol(v);
    engineRef.current?.setExternalVolume(v);
  }, []);

  // Atajos de los carts (1 tecla) y Esc para detenerlos todos.
  useEffect(() => {
    const keys = hotkeyMap(carts);
    const h = (e: KeyboardEvent) => {
      if (!visibleRef.current || e.ctrlKey || e.altKey || e.metaKey || isTypingTarget(e.target as HTMLElement | null)) return;
      if (e.key === "Escape") {
        engineRef.current?.stopAllCarts();
        return;
      }
      if (e.repeat || e.code === pttCodeRef.current) return;
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

  // Fin del horario del DJ: se fija al salir al aire y manda el cierre automático y la cuenta regresiva.
  const scheduledEndsAt = useMemo(() => {
    if (!djInfo?.scheduled) return null;
    if (programChoice && programChoice !== djInfo.scheduled.program.id) return null; // «emitir como» otro programa: sin hora de fin
    return Date.parse(djInfo.scheduled.endsAt);
  }, [djInfo, programChoice]);
  const [liveEndsAt, setLiveEndsAt] = useState<number | null>(null);

  const toggleLive = useCallback(async () => {
    if (live === "live" || live === "connecting" || live === "reconnecting") {
      senderRef.current?.stop();
      senderRef.current = null;
      liveSinceRef.current = null;
      setElapsed(0);
      setLiveEndsAt(null);
      return;
    }
    if (senderRef.current || startingRef.current) return; // doble clic: ya hay una conexión en curso
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported(WEBCAST_MIME)) {
      setMessage("Este navegador no puede emitir en vivo. Usa Chrome, Edge o Firefox actualizados.");
      return;
    }
    startingRef.current = true;
    setLiveEndsAt(scheduledEndsAt);
    try {
      setMessage(null);
      const liveCreds = locked ? await fetchDjCredentials() : creds;
      const e = getEngine();
      await e.resume();
      if (!locked) {
        try {
          sessionStorage.setItem(CREDS_KEY, JSON.stringify(creds));
        } catch {
          /* sin almacenamiento */
        }
      }
      const sender = new WebcastSender({
        url: WEBCAST_URL,
        creds: liveCreds,
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
  }, [live, creds, locked, getEngine, metaFor, scheduledEndsAt]);

  const toggleRef = useRef(toggleLive);
  useEffect(() => {
    toggleRef.current = toggleLive;
  }, [toggleLive]);

  const onAir = live === "live" || live === "connecting" || live === "reconnecting";

  // Barra «EN VIVO» del panel: estado compartido y botón Desconectar.
  useEffect(() => {
    liveStore.set(onAir ? { live: true, since: liveSinceRef.current, program: activeProgram?.name ?? null, endsAt: liveEndsAt } : { live: false, since: null, program: null, endsAt: null });
  }, [onAir, activeProgram, liveEndsAt]);
  useEffect(() => {
    const off = liveStore.registerStop(() => {
      if (senderRef.current) void toggleRef.current();
    });
    return () => {
      off();
      liveStore.set({ live: false, since: null, program: null, endsAt: null });
    };
  }, []);

  // Al terminar el horario del programa se cierra la transmisión.
  useEffect(() => {
    if (!onAir || liveEndsAt === null) return;
    const t = setInterval(() => {
      if (Date.now() >= liveEndsAt) {
        setMessage("Terminó el horario de tu programa: se cerró la transmisión.");
        void toggleRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [onAir, liveEndsAt]);

  // Recargar o cerrar la pestaña cortaría la emisión: se pide confirmación.
  useEffect(() => {
    if (!onAir) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [onAir]);

  // Atajo: espacio = play/pausa del deck activo (fuera de campos de texto).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!visibleRef.current || e.code !== "Space") return;
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

  const hot = new Set<ToolId>();
  if (micActive && !micMuted) hot.add("voice");
  if (relayState === "playing" || relayState === "connecting") hot.add("relay");
  if (cabinLive) hot.add("camera");
  if (extOn) hot.add("spotify");
  if (lineOn) hot.add("line");
  if (midi.status === "ready" && midi.inputs.length > 0) hot.add("midi");

  const TOOL_TITLE: Record<ToolId, string> = { midi: "Controlador MIDI", line: "Consola o mezclador externo", voice: "Voz y ducking", chat: "Chat de la audiencia", spotify: "Spotify al aire", relay: "Señal externa", camera: "Cámara en cabina", eq: "Ecualizador" };
  const searchFor = (text: string) => setSearchSeed((cur) => ({ text, n: (cur?.n ?? 0) + 1 }));
  const setBothVolumes = (v: number) => {
    setDecks((d) => ({ A: { ...d.A, volume: v }, B: { ...d.B, volume: v } }));
    engineRef.current?.setDeckVolume("A", v);
    engineRef.current?.setDeckVolume("B", v);
  };

  // Lo que pide el controlador MIDI del DJ. Se vuelve a asignar en cada dibujo, así siempre usa el estado de ahora.
  useEffect(() => {
    midiActionRef.current = (ev) => {
      const id = ev.action;
      if (ev.kind === "fader") {
        const v = ev.value;
        if (id === "vol-master") {
          setMasterVolume(v);
          masterRef.current = v;
          engineRef.current?.setMasterVolume(v);
        } else if (id === "vol-decks") setBothVolumes(v);
        else if (id === "mic-gain") {
          setMicGain(v * 2);
          engineRef.current?.setMicGain(v * 2);
        } else if (id === "vol-line") changeLineVolume(v * 1.5);
        else if (id === "vol-ext") changeExtVolume(v * 1.5);
        return;
      }
      if (id === "mic-ptt") {
        holdTalk(ev.press);
        return;
      }
      if (!ev.press) return; // el resto actúa al pulsar, no al soltar
      const jingle = /^jingle-(\d)$/.exec(id);
      if (jingle) {
        const cart = [...cartsRef.current].sort((a, b) => a.position - b.position)[Number(jingle[1]) - 1];
        if (cart) void fireCart(cart);
        return;
      }
      switch (id) {
        case "play":
          void playMain();
          break;
        case "pause":
          pause(activeRef.current);
          break;
        case "stop":
          stopMain();
          break;
        case "fade":
          void skipMain("fade");
          break;
        case "cut":
          void skipMain("cut");
          break;
        case "restart":
          restartMain();
          break;
        case "carts-stop":
          stopCarts();
          break;
        case "mic-toggle":
          toggleMic();
          break;
        case "event-next": {
          const next = nextOccurrence(eventsRef.current, Date.now());
          if (next) void fireEvents([next.event as EventView]);
          else setMessage("No hay eventos programados para ejecutar.");
          break;
        }
        case "scheduler-toggle":
          changeScheduler(!schedulerOn);
          break;
        case "monitor-toggle":
          changeMonitor(!monitorRef.current);
          break;
      }
    };
  });

  return (
    <div ref={rootRef} className="studio zs">
      <StudioToolbar tool={tool} onTool={setTool} hot={hot} />
      <LiveBar
        state={live}
        user={creds.user}
        password={creds.password}
        onUser={(user) => setEdits((c) => ({ ...c, user }))}
        onPassword={(password) => setEdits((c) => ({ ...c, password }))}
        onToggle={() => void toggleLive()}
        elapsedSec={elapsed}
        endsAt={onAir ? liveEndsAt : null}
        readMaster={readMaster}
        masterVolume={masterVolume}
        onMasterVolume={(v) => {
          setMasterVolume(v);
          masterRef.current = v;
          engineRef.current?.setMasterVolume(v);
        }}
        monitor={monitor}
        onMonitor={changeMonitor}
        message={message}
        dj={/^[a-z0-9_.-]{2,50}$/.test(djUser) ? djInfo : null}
        programChoice={programChoice}
        onProgramChoice={setProgramChoice}
        locked={locked}
      />

      <div className="zs-grid">
        <div className="zs-col">
          <EventsPanel
            events={eventsApi.events}
            state={eventsApi.state}
            carts={carts}
            fired={firedKeys}
            schedulerOn={schedulerOn}
            onSchedulerOn={changeScheduler}
            live={live === "live"}
            onFire={(ev) => void fireEvents([ev])}
            onSave={eventsApi.save}
            onDelete={eventsApi.remove}
            onSaveHours={eventsApi.saveHours}
          />
          <ZaraWindow title={`Pedidos${desk.feed.requests.length > 0 ? ` (${desk.feed.requests.length})` : ""}`} tone="blue" className="zs-requests-win">
            <RequestsPanel bare feed={desk.feed} refresh={desk.refresh} onSearch={searchFor} onSpotify={(text) => { setSpSeed((cur) => ({ text, n: (cur?.n ?? 0) + 1 })); setTool("spotify"); }} />
          </ZaraWindow>
        </div>

        <PrincipalPanel
          decks={decks}
          active={active}
          queue={queue}
          rejected={rejected}
          auto={auto}
          onAuto={setAuto}
          readLR={readLR}
          volume={decks[active].volume}
          onVolume={setBothVolumes}
          onPlay={() => void playMain()}
          onPause={() => pause(active)}
          onStop={stopMain}
          onFade={() => void skipMain("fade")}
          onCut={() => void skipMain("cut")}
          onRestart={restartMain}
          onSeek={(sec) => engineRef.current?.seek(active, sec)}
          onPlayNow={(item) => void playItemNow(item)}
          onAddFiles={addFiles}
          onAddItems={(items) => dispatch({ type: "add", items })}
          onMove={(from, to) => dispatch({ type: "move", from, to })}
          onRemove={(id) => dispatch({ type: "remove", id })}
          onClear={() => dispatch({ type: "clear" })}
        />

        <ZaraWindow title="Explorador de Audio" tone="blue" className="zs-explorer-win">
          <LibraryPanel onAdd={(items) => dispatch({ type: "add", items })} queue={queue} searchSeed={searchSeed} />
        </ZaraWindow>
      </div>

      <JingleBar
        carts={carts}
        state={cartState}
        playing={cartsPlaying}
        onFire={(c) => void fireCart(c)}
        onStopAll={stopCarts}
        readRemaining={readCartRemaining}
        mic={{
          active: micActive,
          muted: micMuted,
          error: micError,
          readLevel: readMicLevel,
          pttLabel: pttLabel(pttCode),
          onToggle: toggleMic,
          onSettings: () => setTool(tool === "voice" ? null : "voice"),
        }}
      />
      <StatusBar live={live} dj={creds.user} program={activeProgram?.name ?? null} queueCount={queue.length} active={active} />

      {/* Ventana de herramientas: sus cuerpos siguen montados (solo se ocultan), así cambiar de herramienta no corta la cámara ni lo que suena. */}
      <section className="zs-drawer" hidden={tool === null} aria-label={tool ? TOOL_TITLE[tool] : "Herramientas"}>
        <header className="zs-win-bar" data-tone="blue">
          <h2 className="zs-win-title">{tool ? TOOL_TITLE[tool] : ""}</h2>
          <button type="button" className="zs-close" onClick={() => setTool(null)} aria-label="Cerrar la ventana de herramientas">
            ✕
          </button>
        </header>
        <div className="zs-drawer-body">
          <div id="tool-midi" className="studio-tool-body" hidden={tool !== "midi"}>
            <MidiPanel
              status={midi.status}
              inputs={midi.inputs}
              map={midi.map}
              learning={midi.learning}
              last={midi.last}
              onConnect={() => void midi.connect()}
              onDisconnect={midi.disconnect}
              onLearn={midi.learn}
              onUnbind={midi.unbind}
              onClear={midi.clearAll}
            />
          </div>
          <div id="tool-line" className="studio-tool-body" hidden={tool !== "line"}>
            <LinePanel active={lineOn} devices={lineDevices} deviceId={lineDeviceId} volume={lineVol} error={lineError} readLevel={readLine} onDevice={setLineDeviceId} onStart={() => void startLine()} onStop={stopLine} onVolume={changeLineVolume} />
          </div>
          <div id="tool-voice" className="studio-tool-body grid content-start gap-4" hidden={tool !== "voice"}>
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
              pttCode={pttCode}
              onPttCode={changePttCode}
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
          <div id="tool-relay" className="studio-tool-body" hidden={tool !== "relay"}>
            <RelayPanel
              name={relay.name}
              configured={relay.configured}
              state={relayState}
              volume={relayVolume}
              track={relayTrack}
              monitor={monitor}
              onMonitor={changeMonitor}
              onToggle={() => void toggleRelay()}
              onVolume={(v) => {
                setRelayVolume(v);
                engineRef.current?.setRelayVolume(v);
              }}
            />
          </div>
          {/* Siempre montado (solo se oculta): cambiar de pestaña no corta el video que se está escuchando. */}
          <div id="tool-spotify" className="studio-tool-body" hidden={tool !== "spotify"}>
            <SpotifyPanel seed={spSeed} program={activeProgram} onAir={{ on: extOn, share: shareExternal, stop: stopExternal, volume: extVol, setVolume: changeExtVolume }} follow={spFollow} onFollow={setSpFollow} />
          </div>
          <div id="tool-chat" className="studio-tool-body" hidden={tool !== "chat"}>
            <ChatModPanel feed={desk.feed} refresh={desk.refresh} dropMessage={desk.dropMessage} />
          </div>
          {/* Siempre montada (solo se oculta): cambiar de pestaña no corta la cámara ni el directo de YouTube. */}
          <div id="tool-camera" className="studio-tool-body" hidden={tool !== "camera"}>
            <CabinCamera compact onActive={setCabinLive} />
          </div>
          <div id="tool-eq" className="studio-tool-body" hidden={tool !== "eq"}>
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
        </div>
      </section>
    </div>
  );
}
