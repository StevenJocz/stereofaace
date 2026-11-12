"use client";

import type { RelayTrack } from "@/modules/studio/relay-meta";
import type { RelayState } from "./engine/audio-engine";

const LABEL: Record<RelayState, string> = {
  idle: "Detenida",
  connecting: "Conectando…",
  playing: "Al aire en la mezcla",
  error: "Sin señal",
};

export function RelayPanel({
  name,
  configured,
  state,
  volume,
  track,
  onToggle,
  onVolume,
}: {
  name: string;
  configured: boolean;
  state: RelayState;
  volume: number;
  track: RelayTrack | null;
  onToggle: () => void;
  onVolume: (v: number) => void;
}) {
  if (!configured) {
    return (
      <section className="studio-voice panel" aria-label="Señal externa">
        <h2 className="display-up text-[1.15rem]">Señal externa</h2>
        <p className="studio-empty !mt-3 !py-3">Aún no hay una señal configurada. Un administrador la pone en Ajustes del estudio.</p>
      </section>
    );
  }
  const on = state === "playing" || state === "connecting";
  return (
    <section className="studio-voice panel" aria-label="Señal externa">
      <h2 className="display-up text-[1.15rem]">Señal externa</h2>
      <div className="cart-now mt-3" data-active={on}>
        <span className="cart-now-dot" style={{ background: state === "error" ? "#ff6b6b" : "var(--accent)" }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">{name}</p>
          <p className="mono text-[0.68rem] text-muted">{LABEL[state]}</p>
        </div>
      </div>
      {state === "playing" && track && (
        <div className="np-card mt-3" aria-label="Suena en la señal">
          <span className="np-cover" aria-hidden="true">
            {track.img ? (
              // eslint-disable-next-line @next/next/no-img-element -- carátula pública del servicio de la señal (https)
              <img src={track.img} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="mono text-muted">♪</span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="mono text-[0.6rem] text-accent-ink">Suena en la señal</p>
            <p className="truncate font-bold leading-tight" title={track.title}>{track.title}</p>
            {track.artist && <p className="mono truncate text-[0.7rem] text-muted">{track.artist}</p>}
            {track.next && <p className="mono mt-1 truncate text-[0.62rem] text-muted/70">Sigue · {track.next}</p>}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className={on ? "btn" : "btn btn-accent"} onClick={onToggle}>
          {on ? "Quitar de la mezcla" : "Poner en la mezcla"}
        </button>
      </div>
      <label className="mono muted mt-4 block">
        <span className="flex items-center justify-between">
          <span>Volumen de la señal</span>
          <span>{Math.round(volume * 100)} %</span>
        </span>
        <input type="range" className="studio-range mt-0.5 w-full" min={0} max={1} step={0.01} value={volume} aria-label="Volumen de la señal externa" onChange={(e) => onVolume(Number(e.target.value))} />
      </label>
      <p className="mono muted mt-3 text-[0.66rem]">Pasa por el mismo canal que la música: el ecualizador y «bajar al hablar» la afectan. Sube y baja el volumen para entrar y salir de ella.</p>
    </section>
  );
}
