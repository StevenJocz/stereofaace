"use client";

import { PollMeter } from "./PollMeter";

export type MicDevice = { id: string; label: string };

export function MicPanel({
  active,
  muted,
  gain,
  gateDb,
  devices,
  deviceId,
  error,
  readLevel,
  onStart,
  onStop,
  onMuted,
  onGain,
  onGate,
  onDevice,
}: {
  active: boolean;
  muted: boolean;
  gain: number;
  gateDb: number;
  devices: MicDevice[];
  deviceId: string;
  error: string | null;
  readLevel: () => number;
  onStart: () => void;
  onStop: () => void;
  onMuted: (m: boolean) => void;
  onGain: (g: number) => void;
  onGate: (db: number) => void;
  onDevice: (id: string) => void;
}) {
  return (
    <section className="studio-voice panel" aria-label="Micrófono">
      <header className="flex items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Micrófono</h2>
        {active && <span className={muted ? "badge badge-warn" : "badge badge-ok"}>{muted ? "Silenciado" : "Abierto"}</span>}
      </header>
      <label className="mt-3 block">
        <span className="mono muted block">Dispositivo</span>
        <select className="input w-full" value={deviceId} onChange={(e) => onDevice(e.target.value)} aria-label="Dispositivo de micrófono">
          <option value="">Predeterminado</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={active ? "btn" : "btn btn-accent"} onClick={active ? onStop : onStart}>
          {active ? "Apagar micrófono" : "Activar micrófono"}
        </button>
        <button
          type="button"
          className="btn"
          disabled={!active}
          aria-pressed={!muted}
          onClick={() => onMuted(!muted)}
        >
          {muted ? "Hablar" : "Silenciar"}
        </button>
      </div>
      <p className="mono muted mt-2">Mantén la tecla V para hablar mientras está silenciado.</p>
      <PollMeter read={readLevel} label="Nivel del micrófono" className="mt-3" />
      <label className="mono muted mt-3 flex items-center gap-2">
        Ganancia
        <input type="range" className="studio-range flex-1" aria-label="Ganancia del micrófono" min={0} max={2} step={0.05} value={gain} onChange={(e) => onGain(Number(e.target.value))} />
        <span>{Math.round(gain * 100)}%</span>
      </label>
      <label className="mono muted mt-2 flex items-center gap-2">
        Puerta de ruido
        <input type="range" className="studio-range flex-1" aria-label="Umbral de la puerta de ruido" min={-90} max={-20} step={1} value={gateDb} onChange={(e) => onGate(Number(e.target.value))} />
        <span>{gateDb} dB</span>
      </label>
      {error && (
        <p role="alert" className="mono mt-3 text-[var(--violet)]">
          {error}
        </p>
      )}
    </section>
  );
}
