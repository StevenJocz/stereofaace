"use client";

import { useEffect, useRef, useState } from "react";
import { Art } from "@/ui/Art";
import { Mark } from "@/ui/Header";
import { TopoLines } from "@/ui/spaces/TopoLines";
import { useRadio, type RadioStatus } from "./RadioProvider";
import { ScheduleModal } from "./ScheduleModal";
import { OWN_STATION_SLUG, useNowPlayingProgram } from "./useNowPlayingProgram";
import { ChatPanel } from "@/ui/chat/ChatPanel";
import { useStationTracks } from "./useStationTracks";
import { Visualizer } from "./Visualizer";
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
  prev: <path d="M6 5v14M19 5L9 12l10 7z" />,
  next: <path d="M18 5v14M5 5l10 7-10 7z" />,
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

/** Barra fija inferior de StereoFace Frequencies. Se oculta si no hay emisoras activas. */
export function RadioBar() {
  const r = useRadio();
  const bar = useRef<HTMLElement>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  // La programación solo existe para la emisora propia (StereoFace Radio).
  const program = useNowPlayingProgram(r.current?.slug === OWN_STATION_SLUG);
  const tracks = useStationTracks(r.current?.slug === OWN_STATION_SLUG);
  const listeners = tracks?.listeners ?? null;

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

  const playLabel = isEmbed
    ? "Abrir reproductor oficial"
    : playing
      ? "Pausar"
      : r.status === "error"
        ? "Reintentar conexión"
        : "Reproducir";
  const onPlay = r.status === "error" ? r.retry : r.toggle;
  const playIcon = isEmbed ? "list" : playing ? "pause" : "play";

  return (
    <>
      <StationPanel />
      {own && <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />}
      {own && <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />}
      <section ref={bar} aria-label="StereoFace Radio, en directo" className="radio-bar">
        <div className="wrap">
          <div className="rb-card">
            <span className="rb-glow" aria-hidden="true" />

            {/* Marca (solo pantallas amplias) */}
            <div className="rb-logo" aria-hidden="true">
              <span className="rb-logo-mark">
                <Mark size={22} />
                <span className="display-wide rb-logo-name">
                  Stereo<span className="text-accent-ink">Face</span>
                </span>
              </span>
              <span className="mono rb-logo-sub">R A D I O</span>
              <TopoLines />
            </div>

            {/* Portada */}
            {own ? (
              <button type="button" className="rb-cover" onClick={() => setScheduleOpen(true)} aria-label={program ? `Al aire: ${program.program.name}. Ver programación completa` : `${s.name}, en vivo. Ver programación completa`}>
                <i className="rb-plus rb-plus-a" aria-hidden="true" />
                <i className="rb-plus rb-plus-b" aria-hidden="true" />
                <i className="rb-plus rb-plus-c" aria-hidden="true" />
                <i className="rb-plus rb-plus-d" aria-hidden="true" />
                {program?.program.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
                  <img src={program.program.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                ) : program ? (
                  <span className="display-up grid size-full place-items-center text-[2rem] text-black" style={{ background: `linear-gradient(135deg, ${program.program.color}, #0c0c0c)` }}>
                    {program.program.name.slice(0, 1)}
                  </span>
                ) : (
                  <span className="grid size-full place-items-center bg-black">
                    <Mark size={38} />
                  </span>
                )}
              </button>
            ) : (
              <span className="rb-cover" aria-hidden="true">
                <i className="rb-plus rb-plus-a" />
                <i className="rb-plus rb-plus-b" />
                <i className="rb-plus rb-plus-c" />
                <i className="rb-plus rb-plus-d" />
                {s.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagen remota de la emisora: no se optimiza ni se almacena en nuestro servidor
                  <img src={s.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <Art scene="wave" tone="acid" seed={seedOf(s.name)} />
                )}
              </span>
            )}

            {/* Información, onda y controles */}
            <div className="rb-main">
              <p className="rb-top">
                <span className="rb-badge">
                  <span aria-hidden="true" className={`rb-badge-dot ${playing ? "live-dot" : ""}`} />
                  {own ? "En directo" : "Radio en vivo"}
                </span>
                <span className="rb-station">{own ? "StereoFace Radio" : (s.isDemo ? `${s.name} · demo` : s.name)}</span>
                {r.status === "error" && (
                  <button type="button" onClick={r.retry} className="mono text-accent-ink underline">
                    Reintentar
                  </button>
                )}
              </p>
              <h2 className="rb-title">{own && program ? program.program.name : s.name}</h2>
              <p className="rb-genres">
                {own
                  ? (program?.program.hosts ? `Con ${program.program.hosts}` : "Electrónica / Indie / Underground")
                  : ([s.country, s.genres.join(" / ") || "Género por definir"].filter(Boolean).join(" · "))}
              </p>
              {own && tracks?.nowPlaying && (
                <p className="rb-track">♪ {tracks.nowPlaying.artist ? `${tracks.nowPlaying.title} — ${tracks.nowPlaying.artist}` : tracks.nowPlaying.title}</p>
              )}
              {!own && (
                <p className="rb-track">
                  <Attribution s={s} />
                </p>
              )}
              <div className="rb-wave">
                <Visualizer deck active={r.status === "playing"} analysable={r.analysable} silenced={silenced} getAnalyser={r.getAnalyser} />
              </div>
              <div className="rb-controls">
                {own && (
                  <button type="button" className="rb-ghost" onClick={() => setScheduleOpen(true)} aria-label="Ver la programación">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="4" y="5" width="16" height="15" rx="2.5" />
                      <path d="M8 3v4M16 3v4M4 10h16" />
                    </svg>
                  </button>
                )}
                {r.stations.length > 1 && (
                  <button type="button" className="rb-ghost" onClick={() => r.step(-1)} aria-label="Emisora anterior">
                    <Ico name="prev" size={17} />
                  </button>
                )}
                <button type="button" onClick={onPlay} className="rb-play" aria-label={playLabel}>
                  <Ico name={playIcon} size={20} />
                </button>
                {r.stations.length > 1 && (
                  <button type="button" className="rb-ghost" onClick={() => r.step(1)} aria-label="Emisora siguiente">
                    <Ico name="next" size={17} />
                  </button>
                )}
                {own && (
                  <button type="button" className="rb-ghost" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen} aria-controls="chat-panel" aria-label="Chat y pedidos de canciones">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.3A8 8 0 1 1 21 12z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Estado, oyentes y volumen */}
            <div className="rb-side">
              <div className="rb-live">
                <p className="rb-live-top">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                    <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6" />
                  </svg>
                  <span>{r.status === "playing" ? "En vivo" : STATUS[r.status].label}</span>
                </p>
                {own && listeners !== null && (
                  <p className="rb-live-sub">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="9" r="3.6" />
                      <path d="M5 20c.8-3.6 3.6-5.4 7-5.4s6.2 1.8 7 5.4" />
                    </svg>
                    {new Intl.NumberFormat("es-CO").format(listeners)} {listeners === 1 ? "oyente" : "oyentes"}
                  </p>
                )}
              </div>
              <div className="rb-vol">
                <button type="button" className="rb-ghost rb-ghost-sm" onClick={r.toggleMute} aria-pressed={r.muted} aria-label={r.muted ? "Activar sonido" : "Silenciar"}>
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
                {r.stations.length > 1 ? (
                  <button type="button" className="rb-ghost rb-ghost-sm" onClick={() => r.setPanelOpen(!r.panelOpen)} aria-expanded={r.panelOpen} aria-controls="radio-panel" aria-label="Lista de emisoras">
                    <Ico name="list" size={18} />
                  </button>
                ) : own ? (
                  <button type="button" className="rb-ghost rb-ghost-sm" onClick={() => setScheduleOpen(true)} aria-label="Abrir la programación completa">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <span className="sr-only" role="status" aria-live="polite">
            {STATUS[r.status].label}. {r.detail}
          </span>
        </div>
      </section>
    </>
  );
}
