"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type Hls from "hls.js";
import type { PublicStation } from "@/modules/radio/service";

/**
 * StereoFace Frequencies — motor de radio persistente.
 *
 * - Vive en el layout raíz: no se desmonta al navegar, así que el audio no se corta.
 * - La señal se reproduce DIRECTAMENTE desde el origen en el navegador. Este código no pasa audio por
 *   nuestro servidor y no hay ruta de proxy.
 * - Nunca arranca solo: `play()` solo se llama desde un gesto de la persona (clic/tecla/Media Session).
 * - HLS: hls.js cuando el navegador tiene MSE; reproducción nativa (Safari/iOS) cuando no.
 * - El grafo de Web Audio (para el visualizador) solo se conecta si hay acceso real a los datos de audio.
 */

export type RadioStatus = "idle" | "loading" | "playing" | "paused" | "reconnecting" | "offline" | "error" | "embed";

type Ctx = {
  stations: PublicStation[];
  loaded: boolean;
  current: PublicStation | null;
  status: RadioStatus;
  detail: string;
  attempt: number;
  maxAttempts: number;
  volume: number;
  muted: boolean;
  panelOpen: boolean;
  /** El navegador puede leer los datos de audio de la emisora actual (visualizador real). */
  analysable: boolean;
  setPanelOpen: (v: boolean) => void;
  select: (id: string, play?: boolean) => void;
  step: (dir: 1 | -1) => void;
  toggle: () => void;
  pause: () => void;
  retry: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  getAnalyser: () => AnalyserNode | null;
};

const RadioContext = createContext<Ctx | null>(null);

export function useRadio(): Ctx {
  const c = useContext(RadioContext);
  if (!c) throw new Error("useRadio debe usarse dentro de <RadioProvider>");
  return c;
}

const MAX_ATTEMPTS = 5;
const STORE_KEY = "sf-radio";
const STALE_AFTER_MS = 10_000;

type Stored = { stationId?: string; volume?: number; muted?: boolean };
const readStore = (): Stored => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
};
const writeStore = (patch: Stored) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...patch }));
  } catch {
    /* sin almacenamiento: se pierde solo la preferencia */
  }
};

const hasMse = () => typeof window !== "undefined" && ("MediaSource" in window || "ManagedMediaSource" in window);

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function RadioProvider({ children }: { children: ReactNode }) {
  const [stations, setStations] = useState<PublicStation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [status, setStatus] = useState<RadioStatus>("idle");
  const [detail, setDetail] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [analysable, setAnalysable] = useState(false);

  const startRef = useRef<(s: PublicStation) => void>(() => {});
  const stationsRef = useRef<PublicStation[]>([]);
  const currentRef = useRef<PublicStation | null>(null);
  const volumeRef = useRef({ volume: 0.8, muted: false });
  const host = useRef<HTMLDivElement>(null);
  const eng = useRef({
    media: null as HTMLVideoElement | null,
    hls: null as Hls | null,
    ctx: null as AudioContext | null,
    gain: null as GainNode | null,
    analyser: null as AnalyserNode | null,
    timer: 0,
    attempts: 0,
    mediaRecoveries: 0,
    pausedAt: 0,
    token: 0,
    userWantsPlay: false,
  });

  const current = useMemo(() => stations.find((s) => s.id === currentId) ?? null, [stations, currentId]);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  /* ── volumen ── */
  const applyVolume = useCallback(() => {
    const e = eng.current;
    const { volume: v, muted: m } = volumeRef.current;
    if (e.gain) {
      e.gain.gain.value = m ? 0 : v;
      if (e.media) {
        e.media.volume = 1;
        e.media.muted = false;
      }
    } else if (e.media) {
      e.media.volume = v;
      e.media.muted = m;
    }
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.min(1, Math.max(0, v));
      volumeRef.current.volume = clamped;
      volumeRef.current.muted = clamped === 0 ? true : false;
      setVolumeState(clamped);
      setMuted(volumeRef.current.muted);
      writeStore({ volume: clamped, muted: volumeRef.current.muted });
      applyVolume();
    },
    [applyVolume],
  );

  const toggleMute = useCallback(() => {
    const m = !volumeRef.current.muted;
    if (!m && volumeRef.current.volume === 0) volumeRef.current.volume = 0.5;
    volumeRef.current.muted = m;
    setMuted(m);
    setVolumeState(volumeRef.current.volume);
    writeStore({ volume: volumeRef.current.volume, muted: m });
    applyVolume();
  }, [applyVolume]);

  /* ── ciclo de vida del elemento de medios ── */
  const teardown = useCallback(() => {
    const e = eng.current;
    window.clearTimeout(e.timer);
    e.token++;
    e.hls?.destroy();
    e.hls = null;
    if (e.media) {
      e.media.pause();
      e.media.removeAttribute("src");
      e.media.load();
      e.media.remove();
    }
    e.media = null;
    e.gain?.disconnect();
    e.analyser?.disconnect();
    e.gain = null;
    e.analyser = null;
    setAnalysable(false);
  }, []);

  const scheduleReconnect = useCallback((reason: string, reload: () => void) => {
    const e = eng.current;
    window.clearTimeout(e.timer);
    if (!navigator.onLine) {
      setStatus("offline");
      setDetail("Sin conexión a internet. Reconectaremos al volver.");
      return;
    }
    if (e.attempts >= MAX_ATTEMPTS) {
      setStatus("error");
      setDetail(`No pudimos conectar con la emisora (${reason}). Puedes reintentar.`);
      return;
    }
    e.attempts += 1;
    setAttempt(e.attempts);
    setStatus("reconnecting");
    setDetail(`${reason}. Reintentando (${e.attempts}/${MAX_ATTEMPTS})…`);
    const delay = Math.min(1000 * 2 ** (e.attempts - 1), 15_000) + Math.random() * 400;
    e.timer = window.setTimeout(reload, delay);
  }, []);

  const startStation = useCallback(
    (station: PublicStation) => {
      const e = eng.current;
      teardown();
      const token = e.token;
      e.userWantsPlay = true;
      e.mediaRecoveries = 0;

      if (station.streamKind === "embed" || !station.streamUrl) {
        setStatus(station.streamKind === "embed" ? "embed" : "error");
        setDetail(
          station.streamKind === "embed"
            ? "Reproductor oficial de la emisora"
            : "Esta emisora no tiene señal configurada",
        );
        return;
      }

      setStatus("loading");
      setDetail("Conectando…");

      const url = station.streamUrl;
      const media = document.createElement("video");
      media.playsInline = true;
      media.preload = "none";
      media.setAttribute("aria-hidden", "true");
      media.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none";
      const useHlsJs = station.streamKind === "hls" && hasMse();
      // Con CORS declarado, permitir leer el audio; sin CORS, NO pedirlo (si no, el origen rechazaría la conexión).
      if (station.corsEnabled && !useHlsJs) media.crossOrigin = "anonymous";
      host.current?.appendChild(media);
      e.media = media;

      // Visualizador: solo hay datos reales de audio con CORS (flujo directo) o con hls.js (blob del mismo origen).
      const canAnalyse = useHlsJs || station.corsEnabled;
      if (canAnalyse) {
        try {
          const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
          if (Ctor) {
            e.ctx ??= new Ctor();
            void e.ctx.resume();
            const src = e.ctx.createMediaElementSource(media);
            const gain = e.ctx.createGain();
            const analyser = e.ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            src.connect(gain);
            gain.connect(analyser);
            analyser.connect(e.ctx.destination);
            e.gain = gain;
            e.analyser = analyser;
            setAnalysable(true);
          }
        } catch {
          e.gain = null;
          e.analyser = null;
          setAnalysable(false);
        }
      }
      applyVolume();

      const alive = () => e.token === token;
      const fail = (reason: string) => {
        if (!alive()) return;
        scheduleReconnect(reason, () => alive() && currentRef.current && startRef.current(currentRef.current));
      };

      media.addEventListener("playing", () => {
        if (!alive()) return;
        e.attempts = 0;
        setAttempt(0);
        setStatus("playing");
        setDetail("Reproduciendo");
      });
      media.addEventListener(
        "waiting",
        () => alive() && e.userWantsPlay && setStatus((s) => (s === "playing" ? "loading" : s)),
      );
      media.addEventListener("pause", () => {
        if (!alive() || !e.userWantsPlay) return;
        // Pausa externa (auriculares, sistema operativo): reflejarla.
        e.userWantsPlay = false;
        e.pausedAt = Date.now();
        setStatus("paused");
        setDetail("Pausado");
      });
      media.addEventListener("error", () => fail("Error de reproducción"));
      media.addEventListener("ended", () => fail("La señal terminó"));

      const tryPlay = () => {
        media.play().catch((err: unknown) => {
          if (!alive()) return;
          if ((err as DOMException)?.name === "NotAllowedError") {
            e.userWantsPlay = false;
            setStatus("paused");
            setDetail("Pulsa reproducir para escuchar");
          } else if ((err as DOMException)?.name !== "AbortError") fail("No se pudo iniciar");
        });
      };

      if (useHlsJs) {
        void import("hls.js").then(({ default: HlsLib }) => {
          if (!alive()) return;
          if (!HlsLib.isSupported()) {
            // MSE declarado pero hls.js no lo soporta: intentar reproducción nativa.
            if (media.canPlayType("application/vnd.apple.mpegurl")) {
              media.src = url;
              tryPlay();
            } else {
              setStatus("error");
              setDetail("Tu navegador no soporta HLS");
            }
            return;
          }
          const hls = new HlsLib({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 20,
            liveSyncDurationCount: 3,
            manifestLoadingMaxRetry: 1,
            levelLoadingMaxRetry: 2,
            fragLoadingMaxRetry: 3,
          });
          e.hls = hls;
          hls.on(HlsLib.Events.ERROR, (_ev, data) => {
            if (!alive() || !data.fatal) return;
            if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR && e.mediaRecoveries < 2) {
              e.mediaRecoveries += 1;
              hls.recoverMediaError();
              return;
            }
            if (
              data.type === HlsLib.ErrorTypes.NETWORK_ERROR &&
              data.details !== HlsLib.ErrorDetails.MANIFEST_LOAD_ERROR
            ) {
              hls.startLoad();
              return;
            }
            fail(
              data.type === HlsLib.ErrorTypes.NETWORK_ERROR
                ? "No se pudo cargar la lista de la emisora"
                : "Error de decodificación",
            );
          });
          hls.loadSource(url);
          hls.attachMedia(media);
          tryPlay();
        });
      } else if (station.streamKind === "hls") {
        if (media.canPlayType("application/vnd.apple.mpegurl")) {
          media.src = url;
          tryPlay();
        } else {
          setStatus("error");
          setDetail("Tu navegador no soporta HLS");
        }
      } else {
        media.src = url;
        tryPlay();
      }
    },
    [applyVolume, scheduleReconnect, teardown],
  );

  useEffect(() => {
    startRef.current = startStation;
  }, [startStation]);

  /* ── acciones públicas (siempre desde un gesto de la persona) ── */
  const select = useCallback(
    (id: string, play = true) => {
      const s = stationsRef.current.find((x) => x.id === id);
      if (!s) return;
      eng.current.attempts = 0;
      setAttempt(0);
      setCurrentId(id);
      currentRef.current = s;
      writeStore({ stationId: id });
      if (play) startStation(s);
      else {
        teardown();
        setStatus(s.streamKind === "embed" ? "embed" : "idle");
        setDetail("");
      }
    },
    [startStation, teardown],
  );

  const pause = useCallback(() => {
    const e = eng.current;
    e.userWantsPlay = false;
    e.pausedAt = Date.now();
    window.clearTimeout(e.timer);
    e.media?.pause();
    setStatus((s) => (s === "idle" || s === "embed" ? s : "paused"));
    setDetail("Pausado");
  }, []);

  const toggle = useCallback(() => {
    const e = eng.current;
    const s = currentRef.current ?? stationsRef.current[0];
    if (!s) return;
    if (!currentRef.current) {
      select(s.id, true);
      return;
    }
    if (s.streamKind === "embed") {
      setPanelOpen(true);
      return;
    }
    if (e.userWantsPlay && e.media && !e.media.paused) {
      pause();
      return;
    }
    // Reanudar: tras una pausa larga el directo está desfasado; reconectar para volver al «ahora».
    if (!e.media || Date.now() - e.pausedAt > STALE_AFTER_MS || e.media.error) startStation(s);
    else {
      e.userWantsPlay = true;
      void e.ctx?.resume();
      void e.media.play().catch(() => startStation(s));
    }
  }, [pause, select, startStation]);

  const retry = useCallback(() => {
    const s = currentRef.current;
    if (!s) return;
    eng.current.attempts = 0;
    setAttempt(0);
    startStation(s);
  }, [startStation]);

  const step = useCallback(
    (dir: 1 | -1) => {
      const list = stationsRef.current;
      if (list.length < 2) return;
      const i = list.findIndex((x) => x.id === currentRef.current?.id);
      const next = list[(i + dir + list.length) % list.length];
      select(next.id, true);
    },
    [select],
  );

  const getAnalyser = useCallback(() => eng.current.analyser, []);

  /* ── carga de emisoras y preferencias (sin reproducir) ── */
  useEffect(() => {
    const stored = readStore();
    if (typeof stored.volume === "number") {
      volumeRef.current.volume = Math.min(1, Math.max(0, stored.volume));
      setVolumeState(volumeRef.current.volume);
    }
    if (typeof stored.muted === "boolean") {
      volumeRef.current.muted = stored.muted;
      setMuted(stored.muted);
    }
    const ac = new AbortController();
    fetch("/api/radio/stations", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : { stations: [] }))
      .then((d: { stations?: PublicStation[] }) => {
        const list = d.stations ?? [];
        stationsRef.current = list;
        setStations(list);
        const pick = list.find((s) => s.id === stored.stationId) ?? list[0] ?? null;
        if (pick) {
          setCurrentId(pick.id);
          currentRef.current = pick;
          setStatus(pick.streamKind === "embed" ? "embed" : "idle");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    return () => ac.abort();
  }, []);

  /* ── conexión de red ── */
  useEffect(() => {
    const onOnline = () => {
      const e = eng.current;
      if (
        e.userWantsPlay &&
        currentRef.current &&
        (status === "offline" || status === "error" || status === "reconnecting")
      ) {
        e.attempts = 0;
        setAttempt(0);
        startStation(currentRef.current);
      }
    };
    const onOffline = () => {
      if (eng.current.userWantsPlay) {
        setStatus("offline");
        setDetail("Sin conexión a internet. Reconectaremos al volver.");
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [startStation, status]);

  /* ── Media Session: controles del sistema y metadatos ── */
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    const art = current.imageUrl ? [{ src: current.imageUrl, sizes: "512x512" }] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.name,
      artist: [current.country, current.genres.join(", ")].filter(Boolean).join(" · ") || "Radio en vivo",
      album: "StereoFace Frequencies",
      artwork: art,
    });
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : status === "paused" ? "paused" : "none";
  }, [current, status]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => toggle());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
    return () => {
      for (const a of ["play", "pause", "previoustrack", "nexttrack"] as const)
        navigator.mediaSession.setActionHandler(a, null);
    };
  }, [toggle, pause, step]);

  // Reserva de espacio inferior mientras la barra esté visible.
  useEffect(() => {
    document.body.dataset.radio = stations.length > 0 ? "on" : "";
  }, [stations.length]);

  // Limpieza al desmontar el proveedor (cierre de la aplicación).
  useEffect(() => {
    const e = eng.current;
    return () => {
      window.clearTimeout(e.timer);
      e.hls?.destroy();
      e.media?.pause();
      void e.ctx?.close();
    };
  }, []);

  const value: Ctx = {
    stations,
    loaded,
    current,
    status,
    detail,
    attempt,
    maxAttempts: MAX_ATTEMPTS,
    volume,
    muted,
    panelOpen,
    analysable,
    setPanelOpen,
    select,
    step,
    toggle,
    pause,
    retry,
    setVolume,
    toggleMute,
    getAnalyser,
  };

  return (
    <RadioContext.Provider value={value}>
      {children}
      <div ref={host} aria-hidden="true" />
    </RadioContext.Provider>
  );
}
