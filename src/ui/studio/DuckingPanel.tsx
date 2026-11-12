"use client";

import { PollValue } from "./PollMeter";
import { DEFAULT_DUCK, type DuckSettings } from "./engine/voice";

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="mono muted mt-2 flex items-center gap-2">
      <span className="w-28 shrink-0">{label}</span>
      <input type="range" className="studio-range flex-1" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="w-16 text-right">
        {value} {unit}
      </span>
    </label>
  );
}

export function DuckingPanel({
  settings,
  onChange,
  onForce,
  readDuckDb,
}: {
  settings: DuckSettings;
  onChange: (s: DuckSettings) => void;
  onForce: (on: boolean) => void;
  readDuckDb: () => number;
}) {
  const set = (patch: Partial<DuckSettings>) => onChange({ ...settings, ...patch });
  return (
    <section className="studio-voice panel" aria-label="Ducking">
      <header className="flex items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Música de fondo</h2>
        <label className="mono muted flex items-center gap-2">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Bajar al hablar
        </label>
      </header>
      <p className="mono muted mt-2">
        Reducción actual: <PollValue read={readDuckDb} format={(v) => `${Math.round(v)} dB`} />
      </p>
      <Slider label="Reducción" value={settings.reductionDb} min={-40} max={0} step={1} unit="dB" onChange={(v) => set({ reductionDb: v })} />
      <Slider label="Umbral de voz" value={settings.thresholdDb} min={-80} max={-10} step={1} unit="dB" onChange={(v) => set({ thresholdDb: v })} />
      <Slider label="Ataque" value={settings.attackMs} min={10} max={1000} step={10} unit="ms" onChange={(v) => set({ attackMs: v })} />
      <Slider label="Recuperación" value={settings.releaseMs} min={100} max={5000} step={100} unit="ms" onChange={(v) => set({ releaseMs: v })} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onPointerDown={() => onForce(true)}
          onPointerUp={() => onForce(false)}
          onPointerLeave={() => onForce(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") onForce(true);
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") onForce(false);
          }}
          onBlur={() => onForce(false)}
        >
          Bajar música (mantener)
        </button>
        <button type="button" className="btn" onClick={() => onChange(DEFAULT_DUCK)}>
          Valores por defecto
        </button>
      </div>
    </section>
  );
}
