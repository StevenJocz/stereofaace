"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Art } from "@/ui/Art";
import { useRadio, type RadioStatus } from "./RadioProvider";
import { ScheduleModal } from "./ScheduleModal";
import { OWN_STATION_SLUG, useNowPlayingProgram } from "./useNowPlayingProgram";
import { ChatPanel, type ChatTabId } from "@/ui/chat/ChatPanel";
import { useStationTracks } from "./useStationTracks";
import { Visualizer } from "./Visualizer";
import { VinylDisc } from "@/ui/studio/VinylDisc";
import type { PublicStation } from "@/modules/radio/service";

const STATUS: Record<RadioStatus, { label: string; tone: "live" | "busy" | "idle" | "warn" | "bad" }> = {
  idle: { label: "Listo", tone: "idle" },
  loading: { label: "Conectando…", tone: "busy" },
  playing: { label: "Conectado", tone: "live" },
  paused: { label: "Pausado", tone: "idle" },
  reconnecting: { label: "Reconectando", tone: "warn" },
  offline: { label: "Sin conexión", tone: "bad" },
  error: { label: "Error de conexión", tone: "bad" },
  embed: { label: "Reproductor oficial", tone: "busy" },
};

const Icon = {
  play: <path d="M7 5v14l11-7z" fill="currentColor" stroke="none" />,
  pause: <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none" />,
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  vol: <path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />,
  mute: <path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};
function Ico({ name, size = 18 }: { name: keyof typeof Icon; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {Icon[name]}
    </svg>
  );
}

function seedOf(name: string) {
  let h = 7;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 100000;
  return h;
}

function Cover({ s, size }: { s: PublicStation; size: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-[8px] border border-line bg-black ${size}`}>
      {s.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen remota de la emisora: no se optimiza ni se almacena en nuestro servidor
        <img src={s.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover" />
      ) : (
        <Art scene="wave" tone="acid" seed={seedOf(s.name)} />
      )}
    </span>
  );
}

function Attribution({ s, className = "" }: { s: PublicStation; className?: string }) {
  return (
    <a
      href={s.attributionUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`mono inline-flex max-w-full items-center gap-1 truncate text-[0.62rem] text-muted underline-offset-2 hover:text-accent-ink hover:underline ${className}`}
      title={s.attributionNote ?? `Señal de ${s.attributionName}`}
    >
      <span className="truncate">Señal: {s.attributionName}</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function StatusPill({ status, attempt, max }: { status: RadioStatus; attempt: number; max: number }) {
  const { label, tone } = STATUS[status];
  const dot =
    tone === "live"
      ? "bg-accent live-dot"
      : tone === "busy"
        ? "bg-violet animate-pulse"
        : tone === "warn"
          ? "bg-[#ffd23f] animate-pulse"
          : tone === "bad"
            ? "bg-[#ff6b6b]"
            : "bg-muted";
  return (
    <span className="mono inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[0.62rem]">
      <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${dot}`} />
      {label}
      {status === "reconnecting" && (
        <span className="text-muted">
          {attempt}/{max}
        </span>
      )}
    </span>
  );
}

function StationPanel() {
  const r = useRadio();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!r.panelOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && r.setPanelOpen(false);
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [r]);

  if (!r.panelOpen) return null;
  const cur = r.current;
  return (
    <div
      ref={ref}
      id="radio-panel"
      role="dialog"
      aria-label="Emisoras de StereoFace Frequencies"
      className="radio-panel"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="display-up text-[0.95rem]">Emisoras</h2>
        <button
          type="button"
          className="btn-icon !size-8"
          onClick={() => r.setPanelOpen(false)}
          aria-label="Cerrar lista de emisoras"
        >
          <Ico name="close" size={14} />
        </button>
      </div>

      <ul className="max-h-[min(45vh,22rem)] overflow-y-auto">
        {r.stations.map((s) => {
          const active = s.id === cur?.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => r.select(s.id, true)}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-accent/10 ${active ? "bg-accent/10" : ""}`}
              >
                <Cover s={s} size="size-11" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="mono block truncate text-muted">
                    {[s.country, s.genres.join(", ")].filter(Boolean).join(" · ") || "Radio en vivo"}
                  </span>
                </span>
                {active && <span className="mono text-accent-ink">{STATUS[r.status].label}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {cur?.streamKind === "embed" && cur.embedUrl && (
        <div className="border-b border-line p-4">
          <p className="mono mb-2 text-muted">Reproductor oficial de {cur.attributionName}</p>
          <iframe
            src={cur.embedUrl}
            title={`Reproductor oficial de ${cur.name}`}
            className="h-28 w-full rounded-[8px] border border-line bg-black"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allow="encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        </div>
      )}

      <p className="px-4 py-3 text-[0.72rem] leading-snug text-muted">
        Las emisoras se reproducen directamente desde su origen. StereoFace no descarga, almacena ni retransmite señales
        de terceros. Toda la programación pertenece a cada emisora.
      </p>
    </div>
  );
}

/* ───────────── Favoritos (solo en este navegador) ───────────── */

const FAV_KEY = "sf-radio-favs";
const FAV_EVENT = "sf-radio-favs-change";
type Favs = { tracks: string[]; stations: string[] };

const readFavsRaw = () => {
  try {
    return localStorage.getItem(FAV_KEY) ?? "";
  } catch {
    return "";
  }
};
const parseFavs = (raw: string): Favs => {
  try {
    const d = JSON.parse(raw || "{}") as Partial<Favs>;
    return {
      tracks: Array.isArray(d.tracks) ? d.tracks.filter((x) => typeof x === "string") : [],
      stations: Array.isArray(d.stations) ? d.stations.filter((x) => typeof x === "string") : [],
    };
  } catch {
    return { tracks: [], stations: [] };
  }
};
const subscribeFavs = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(FAV_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(FAV_EVENT, cb);
  };
};

/** Pistas y emisoras marcadas como favoritas. Se guardan en el navegador de quien escucha (sin cuenta, sin servidor). */
function useFavorites() {
  const raw = useSyncExternalStore(subscribeFavs, readFavsRaw, () => "");
  const favs = useMemo(() => parseFavs(raw), [raw]);
  const toggle = (kind: keyof Favs, id: string) => {
    const cur = parseFavs(readFavsRaw());
    const list = cur[kind];
    cur[kind] = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list].slice(0, 200);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(cur));
    } catch {
      /* sin almacenamiento: no se puede guardar el favorito */
    }
    window.dispatchEvent(new Event(FAV_EVENT));
  };
  return { favs, toggle };
}

/** Pantalla completa del navegador (oculto si no está disponible). */
function useFullscreen() {
  const active = useSyncExternalStore(
    (cb) => {
      document.addEventListener("fullscreenchange", cb);
      return () => document.removeEventListener("fullscreenchange", cb);
    },
    () => document.fullscreenElement !== null,
    () => false,
  );
  const supported = typeof document !== "undefined" && document.fullscreenEnabled === true;
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { active, supported, toggle };
}

/* ───────────── Iconos propios de la barra ───────────── */

function Svg({ children, size = 18, fill = "none" }: { children: React.ReactNode; size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const IcoHeart = ({ filled }: { filled?: boolean }) => (
  <Svg fill={filled ? "currentColor" : "none"}>
    <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.6c0 5.6-7.5 10.2-7.5 10.2Z" />
  </Svg>
);
const IcoStar = ({ filled }: { filled?: boolean }) => (
  <Svg size={19} fill={filled ? "currentColor" : "none"}>
    <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9Z" />
  </Svg>
);
const IcoChat = () => (
  <Svg size={16}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z" />
  </Svg>
);
const IcoNote = () => (
  <Svg size={16}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Svg>
);
const IcoShare = () => (
  <Svg size={19}>
    <circle cx="6" cy="12" r="2.4" />
    <circle cx="17.5" cy="5.8" r="2.4" />
    <circle cx="17.5" cy="18.2" r="2.4" />
    <path d="m8.1 10.8 7.3-3.8M8.1 13.2l7.3 3.8" />
  </Svg>
);
const IcoCalendar = () => (
  <Svg size={19}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </Svg>
);
const IcoExpand = ({ active }: { active?: boolean }) => (
  <Svg size={19}>{active ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}</Svg>
);
const IcoWaves = () => (
  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    <path d="M8.4 8.4a5.1 5.1 0 0 0 0 7.2M15.6 8.4a5.1 5.1 0 0 1 0 7.2M5.4 5.4a9.3 9.3 0 0 0 0 13.2M18.6 5.4a9.3 9.3 0 0 1 0 13.2" />
  </svg>
);

/** Marca de la barra: audífonos con ecualizador, sin depender de la imagen del logo. */
function RadioMark() {
  return (
    <svg className="rb-mark" viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rb-mark-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#9b6bff" />
          <stop offset="0.55" stopColor="#c6ff00" />
          <stop offset="1" stopColor="#c6ff00" />
        </linearGradient>
      </defs>
      <path d="M6 24v-4a14 14 0 0 1 28 0v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="3.5" y="22" width="5.5" height="11" rx="2.4" fill="currentColor" />
      <rect x="31" y="22" width="5.5" height="11" rx="2.4" fill="currentColor" />
      <g fill="url(#rb-mark-g)">
        <rect x="12.5" y="23" width="2.6" height="9" rx="1.1" />
        <rect x="16.5" y="17" width="2.6" height="15" rx="1.1" />
        <rect x="20.5" y="12" width="2.6" height="20" rx="1.1" />
        <rect x="24.5" y="19" width="2.6" height="13" rx="1.1" />
      </g>
    </svg>
  );
}

/** Barra fija inferior de StereoFace Frequencies. Se oculta si no hay emisoras activas. */
export function RadioBar() {
  const r = useRadio();
  const bar = useRef<HTMLElement>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTab, setChatTab] = useState<ChatTabId>("chat");
  const [shareMsg, setShareMsg] = useState("");
  // La programación solo existe para la emisora propia (StereoFace Radio).
  const program = useNowPlayingProgram(r.current?.slug === OWN_STATION_SLUG);
  const tracks = useStationTracks(r.current?.slug === OWN_STATION_SLUG);
  const { favs, toggle: toggleFav } = useFavorites();
  const fullscreen = useFullscreen();

  // Publica la altura real para reservar espacio y colocar el panel.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--radio-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r.loaded, r.stations.length]);

  if (!r.loaded || r.stations.length === 0 || !r.current) return null;
  const s = r.current;
  const own = s.slug === OWN_STATION_SLUG;
  const playing = r.status === "playing" || r.status === "loading" || r.status === "reconnecting";
  const isEmbed = s.streamKind === "embed";
  const silenced = r.muted || r.volume === 0;
  const multi = r.stations.length > 1;

  const playLabel = isEmbed
    ? "Abrir reproductor oficial"
    : playing
      ? "Pausar"
      : r.status === "error"
        ? "Reintentar conexión"
        : "Reproducir";
  const onPlay = r.status === "error" ? r.retry : r.toggle;

  const np = own ? tracks?.nowPlaying : null;
  const trackId = np ? (np.artist ? `${np.artist} - ${np.title}` : np.title) : null;
  const trackFav = trackId !== null && favs.tracks.includes(trackId);
  const stationFav = favs.stations.includes(s.id);

  // El badge dice «En vivo» salvo que haya algo que avisar (conectando, sin conexión…).
  const calm = r.status === "idle" || r.status === "playing" || r.status === "paused";
  const badge = calm ? "En vivo" : STATUS[r.status].label;

  // Disco de vinilo que gira mientras suena. Etiqueta: imagen del programa al aire, el logo de la radio o la carátula de la emisora.
  const programName = own ? program?.program.name : null;
  const disc = (
    <VinylDisc
      compact
      deck="radio"
      playing={r.status === "playing"}
      accent={own && program ? program.program.color : "#c6ff00"}
      coverUrl={own ? (program ? (program.program.imageUrl ?? null) : "/brand/stereoface-logo.png") : (s.imageUrl ?? null)}
      letter={(programName ?? s.name).slice(0, 1).toUpperCase()}
    />
  );

  const openChat = (tab: ChatTabId) => {
    // Pulsar de nuevo el botón de la pestaña que ya está abierta cierra el panel.
    setChatOpen((open) => !(open && chatTab === tab));
    setChatTab(tab);
  };

  const share = async () => {
    const url = window.location.origin;
    const title = own ? "StereoFace Radio" : s.name;
    const text = np && trackId ? `Escuchando «${trackId}» en ${title}` : `Escucha ${title} en directo`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareMsg("Enlace copiado al portapapeles");
    } catch (error) {
      // Cancelar el panel de compartir no es un fallo; si el portapapeles no deja, se muestra el enlace.
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.prompt("Copia el enlace:", url);
      return;
    }
    window.setTimeout(() => setShareMsg(""), 2500);
  };

  return (
    <>
      <StationPanel />
      {own && <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />}
      {own && <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} tab={chatTab} onTabChange={setChatTab} />}
      <section ref={bar} aria-label="StereoFace Radio, en directo" className="radio-bar">
        <div className="wrap">
          <div className="rb-card" data-own={own}>
            <span className="rb-glow" aria-hidden="true" />

            {/* Marca (solo pantallas amplias) */}
            <div className="rb-brand" aria-hidden="true">
              <RadioMark />
              <span className="rb-brand-text">
                <span className="display-wide rb-brand-name">
                  Stereo<span>Face</span>
                </span>
                <span className="mono rb-brand-sub">R A D I O</span>
              </span>
            </div>
            <i className="rb-sep" aria-hidden="true" />

            {/* Portada e información */}
            <div className="rb-now">
              {own ? (
                <button type="button" className="rb-disc" onClick={() => setScheduleOpen(true)} aria-label={program ? `Al aire: ${program.program.name}. Ver programación completa` : `${s.name}, en vivo. Ver programación completa`}>
                  {disc}
                </button>
              ) : (
                <span className="rb-disc" aria-hidden="true">
                  {disc}
                </span>
              )}

              <div className="rb-info">
                <p className="rb-top">
                  <span className="rb-badge" data-tone={calm ? "live" : STATUS[r.status].tone}>
                    {calm ? <IcoWaves /> : <span aria-hidden="true" className="rb-badge-dot" />}
                    {badge}
                  </span>
                  {r.status === "error" && (
                    <button type="button" onClick={r.retry} className="rb-retry">
                      Reintentar
                    </button>
                  )}
                </p>
                <h2 className="rb-title">{own ? (program ? program.program.name : "StereoFace Radio") : s.isDemo ? `${s.name} · demo` : s.name}</h2>
                {own ? (
                  <p className="rb-track">
                    <span className="rb-note" aria-hidden="true">♫</span>
                    {np ? (
                      <>
                        {np.artist && <span className="rb-artist">{np.artist}</span>}
                        {np.artist && <span className="rb-dash" aria-hidden="true">-</span>}
                        <span className="rb-song">{np.title}</span>
                      </>
                    ) : (
                      <span className="rb-artist">{program?.program.hosts ? `Con ${program.program.hosts}` : "Electrónica / Indie / Underground"}</span>
                    )}
                  </p>
                ) : (
                  <p className="rb-track rb-track-ext">
                    <span className="rb-artist">{[s.country, s.genres.join(" / ")].filter(Boolean).join(" · ") || "Radio en vivo"}</span>
                    <Attribution s={s} className="rb-attr" />
                  </p>
                )}
              </div>
            </div>

            {/* Onda */}
            <div className="rb-wave">
              <Visualizer deck bars={40} active={r.status === "playing"} analysable={r.analysable} silenced={silenced} getAnalyser={r.getAnalyser} />
            </div>

            {/* Transporte */}
            <div className="rb-transport">
              <button
                type="button"
                className="rb-btn rb-heart"
                onClick={() => trackId && toggleFav("tracks", trackId)}
                disabled={trackId === null}
                aria-pressed={trackFav}
                aria-label={trackFav ? "Quitar la canción de tus favoritas" : "Guardar la canción en tus favoritas"}
              >
                <IcoHeart filled={trackFav} />
              </button>
              <button type="button" onClick={onPlay} className="rb-play" data-playing={playing || undefined} aria-label={playLabel}>
                {isEmbed ? (
                  <Ico name="list" size={20} />
                ) : playing ? (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="5" width="4.2" height="14" rx="1.3" />
                    <rect x="13.8" y="5" width="4.2" height="14" rx="1.3" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true" className="rb-ico-play">
                    <path d="M7.2 4.8v14.4a.9.9 0 0 0 1.4.8l11.2-7.2a.9.9 0 0 0 0-1.6L8.6 4a.9.9 0 0 0-1.4.8Z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Volumen */}
            <div className="rb-vol">
              <button type="button" className="rb-btn rb-btn-bare" onClick={r.toggleMute} aria-pressed={r.muted} aria-label={r.muted ? "Activar sonido" : "Silenciar"}>
                <Ico name={silenced ? "mute" : "vol"} size={18} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={r.muted ? 0 : r.volume}
                onChange={(e) => r.setVolume(Number(e.target.value))}
                aria-label="Volumen"
                style={{ ["--v" as string]: `${(r.muted ? 0 : r.volume) * 100}%` }}
                className="radio-range"
              />
            </div>

            {/* Chat y pedidos (solo la emisora propia) */}
            {own && (
              <>
                <i className="rb-sep" aria-hidden="true" />
                <div className="rb-cta">
                  <button type="button" className="rb-pill rb-pill-chat" onClick={() => openChat("chat")} aria-expanded={chatOpen && chatTab === "chat"} aria-controls="chat-panel">
                    <IcoChat />
                    Chat en Vivo
                  </button>
                  <button type="button" className="rb-pill rb-pill-req" onClick={() => openChat("requests")} aria-expanded={chatOpen && chatTab === "requests"} aria-controls="chat-panel">
                    <IcoNote />
                    Pedir Canción
                  </button>
                </div>
              </>
            )}
            <i className="rb-sep" aria-hidden="true" />

            {/* Herramientas */}
            <div className="rb-tools">
              <button type="button" className="rb-tool rb-share" onClick={() => void share()} aria-label="Compartir la radio">
                <IcoShare />
              </button>
              {own && (
                <button type="button" className="rb-tool" onClick={() => setScheduleOpen(true)} aria-label="Ver la programación">
                  <IcoCalendar />
                  <span className="rb-tool-label">Programación</span>
                </button>
              )}
              {multi && (
                <button type="button" className="rb-tool" onClick={() => r.setPanelOpen(!r.panelOpen)} aria-expanded={r.panelOpen} aria-controls="radio-panel" aria-label="Lista de emisoras">
                  <Ico name="list" size={19} />
                </button>
              )}
              <button type="button" className="rb-tool" onClick={() => toggleFav("stations", s.id)} aria-pressed={stationFav} aria-label={stationFav ? "Quitar la emisora de tus favoritas" : "Marcar la emisora como favorita"}>
                <IcoStar filled={stationFav} />
              </button>
              {fullscreen.supported && (
                <button type="button" className="rb-tool rb-full" onClick={fullscreen.toggle} aria-pressed={fullscreen.active} aria-label={fullscreen.active ? "Salir de pantalla completa" : "Pantalla completa"}>
                  <IcoExpand active={fullscreen.active} />
                </button>
              )}
            </div>
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {shareMsg || `${STATUS[r.status].label}. ${r.detail}`}
          </span>
          {shareMsg && (
            <span className="rb-toast" aria-hidden="true">
              {shareMsg}
            </span>
          )}
        </div>
      </section>
    </>
  );
}
