"use client";

import { useEffect, useState } from "react";
import { PollMeter } from "./PollMeter";
import { pttLabel, validPttCode } from "./engine/ptt";

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
  pttCode,
  onPttCode,
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
  pttCode: string;
  onPttCode: (code: string) => void;
}) {
  // «Cambiar»: la siguiente tecla que se pulse queda como tecla para hablar (Esc cancela).
  const [capturing, setCapturing] = useState(false);
  const [pttNote, setPttNote] = useState<string | null>(null);
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setCapturing(false);
        setPttNote(null);
      } else if (validPttCode(e.code)) {
        onPttCode(e.code);
        setCapturing(false);
        setPttNote(null);
      } else setPttNote("Esa tecla no se puede usar. Prueba con una letra, un número o una tecla F.");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, onPttCode]);
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
          {active ? "Soltar el micrófono" : "Activar micrófono"}
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
      <div className="mt-3 flex flex-wrap items-center gap-2" data-ptt-capture>
        <span className="mono muted">Tecla para hablar</span>
        <kbd className="zs-kbd" aria-label={`Tecla para hablar: ${pttLabel(pttCode)}`}>
          {capturing ? "Pulsa una tecla…" : pttLabel(pttCode)}
        </kbd>
        <button type="button" className="btn !px-3 !py-1.5" onClick={() => (setCapturing(!capturing), setPttNote(null))} aria-pressed={capturing}>
          {capturing ? "Cancelar" : "Cambiar"}
        </button>
      </div>
      <p className="mono muted mt-2">Mantén esa tecla para hablar mientras el micrófono está apagado; al soltarla se vuelve a apagar.</p>
      {pttNote && (
        <p role="alert" className="mono mt-1 text-[var(--violet)]">
          {pttNote}
        </p>
      )}
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
