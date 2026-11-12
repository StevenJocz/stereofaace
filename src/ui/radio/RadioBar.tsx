"use client";

import { useEffect, useRef, useState } from "react";
import { Art } from "@/ui/Art";
import { useRadio, type RadioStatus } from "./RadioProvider";
import { ScheduleModal } from "./ScheduleModal";
import { OWN_STATION_SLUG, useNowPlayingProgram } from "./useNowPlayingProgram";
import { TrackList } from "./StationTracks";
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
  play: <path d="M8 5v14l11-7z" fill="currentColor" stroke="none" />,
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
  // La programación solo existe para la emisora propia (StereoFace Radio).
  const program = useNowPlayingProgram(r.current?.slug === OWN_STATION_SLUG);
  const tracks = useStationTracks(r.current?.slug === OWN_STATION_SLUG);

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
      <section ref={bar} aria-label="StereoFace Frequencies, radio en vivo" className="radio-bar">
        {/* Móvil: fila 1 = emisora + reproducir; fila 2 = estado + volumen y lista.
            Escritorio (lg): tres columnas con transporte y visualizador. */}
        <div className="wrap grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.5fr)_auto] lg:gap-x-4 lg:py-3 xl:grid-cols-[minmax(0,22rem)_minmax(0,46rem)_auto] xl:justify-between xl:gap-x-8">
          {/* Emisora */}
          <div className="flex min-w-0 items-center gap-3">
            {own && program ? (
              <button
                type="button"
                className="program-block flex min-w-0 items-center gap-3 text-left"
                onClick={() => setScheduleOpen(true)}
                aria-label={`Al aire: ${program.program.name}. Ver programación completa`}
              >
                <span
                  className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-line lg:size-14"
                  style={{ background: `linear-gradient(135deg, ${program.program.color}, #0c0c0c)` }}
                >
                  {program.program.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
                    <img src={program.program.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="display-up text-[1.2rem] text-black">{program.program.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="mono flex items-center gap-2 whitespace-nowrap text-[0.6rem] text-accent-ink">
                    <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-accent live-dot" />
                    Al aire · hasta {new Date(program.endsAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false })}
                    <span aria-hidden="true" className="hidden opacity-70 lg:inline">›</span>
                  </span>
                  <span className="block truncate font-bold leading-tight">{program.program.name}</span>
                  <span className="mono block truncate text-[0.66rem] text-muted">
                    {s.name}
                    {program.program.hosts ? ` · Con ${program.program.hosts}` : ""}
                  </span>
                </span>
              </button>
            ) : (
              <>
                <Cover s={s} size="size-12 lg:size-14" />
                <div className="min-w-0">
                  <p className="mono flex items-center gap-2 text-[0.6rem] text-accent-ink">
                    StereoFace Frequencies
                    {s.isDemo && <span className="tag tag-demo !px-1.5 !py-0 !text-[0.55rem]">Demo</span>}
                  </p>
                  <p className="truncate font-bold leading-tight">{s.name}</p>
                  <p className="mono truncate text-[0.66rem] text-muted">
                    {[s.country, s.genres.join(", ") || "Género por definir"].filter(Boolean).join(" · ")}
                  </p>
                  {own ? (
                    <button type="button" className="mono hidden text-[0.62rem] text-accent-ink underline underline-offset-2 lg:inline" onClick={() => setScheduleOpen(true)}>
                      Ver programación
                    </button>
                  ) : (
                    <Attribution s={s} className="hidden lg:inline-flex" />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Reproducir (solo móvil) */}
          <button type="button" onClick={onPlay} className="radio-play lg:hidden" aria-label={playLabel}>
            <Ico name={playIcon} size={22} />
          </button>

          {/* Estado; en escritorio también transporte y visualizador */}
          <div className="flex min-w-0 items-center gap-3 lg:gap-4">
            <div className="hidden items-center gap-2 lg:flex">
              {!own && (
              <button
                type="button"
                className="btn-icon !size-9"
                onClick={() => r.step(-1)}
                disabled={r.stations.length < 2}
                aria-label="Emisora anterior"
              >
                <Ico name="prev" size={16} />
              </button>
              )}
              <button type="button" onClick={onPlay} className="radio-play" aria-label={playLabel}>
                <Ico name={playIcon} size={22} />
              </button>
              {!own && (
              <button
                type="button"
                className="btn-icon !size-9"
                onClick={() => r.step(1)}
                disabled={r.stations.length < 2}
                aria-label="Emisora siguiente"
              >
                <Ico name="next" size={16} />
              </button>
              )}
            </div>

            <div className="min-w-0 flex-1 lg:flex-none">
              <div className="flex flex-wrap items-center gap-2">
                {!(own && tracks?.nowPlaying && ["idle", "paused", "playing"].includes(r.status)) && (
                  <StatusPill status={r.status} attempt={r.attempt} max={r.maxAttempts} />
                )}
                {r.status === "error" && (
                  <button type="button" onClick={r.retry} className="mono text-accent-ink underline">
                    Reintentar
                  </button>
                )}
              </div>
              <p className="mono mt-1 truncate text-[0.62rem] text-muted lg:hidden">
                {own && tracks?.nowPlaying ? `♪ ${tracks.nowPlaying.artist ? `${tracks.nowPlaying.title} — ${tracks.nowPlaying.artist}` : tracks.nowPlaying.title}` : <Attribution s={s} />}
              </p>
              <span className="sr-only" role="status" aria-live="polite">
                {STATUS[r.status].label}. {r.detail}
              </span>
            </div>

            {own && tracks?.nowPlaying && (
              <div className="hidden min-w-0 flex-1 lg:block">
                <TrackList tracks={tracks} fallbackArt={program?.program.imageUrl ?? null} />
              </div>
            )}
            {/* Con la tarjeta de canciones no se muestra el visualizador: queda más limpio. */}
            {!(own && tracks?.nowPlaying) && (
              <div className="hidden h-11 min-w-0 flex-1 lg:block">
                <Visualizer
                  active={r.status === "playing"}
                  analysable={r.analysable}
                  silenced={silenced}
                  getAnalyser={r.getAnalyser}
                />
              </div>
            )}
          </div>

          {/* Volumen y lista */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-icon !size-9"
              onClick={r.toggleMute}
              aria-pressed={r.muted}
              aria-label={r.muted ? "Activar sonido" : "Silenciar"}
            >
              <Ico name={silenced ? "mute" : "vol"} size={16} />
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
              className="radio-range hidden w-24 lg:block"
            />
          </div>
        </div>
      </section>
    </>
  );
}
