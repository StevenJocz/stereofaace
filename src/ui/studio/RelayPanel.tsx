"use client";

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
  onToggle,
  onVolume,
}: {
  name: string;
  configured: boolean;
  state: RelayState;
  volume: number;
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
