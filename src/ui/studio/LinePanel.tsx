"use client";

import { PollMeter } from "./PollMeter";
import type { MicDevice } from "./MicPanel";

/**
 * Entrada de consola o mezclador externo: si el DJ trae su propio aparato (una consola de DJ, un mezclador, una interfaz de audio USB),
 * elige aquí su entrada y su sonido entra a la emisión como una fuente más, en estéreo y sin procesar la voz.
 */
export function LinePanel({
  active,
  devices,
  deviceId,
  volume,
  error,
  readLevel,
  onDevice,
  onStart,
  onStop,
  onVolume,
}: {
  active: boolean;
  devices: MicDevice[];
  deviceId: string;
  volume: number;
  error: string | null;
  readLevel: () => number;
  onDevice: (id: string) => void;
  onStart: () => void;
  onStop: () => void;
  onVolume: (v: number) => void;
}) {
  return (
    <section className="studio-voice panel" aria-label="Consola externa">
      <header className="flex items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Consola o mezclador</h2>
        {active && <span className="badge badge-ok">Al aire</span>}
      </header>
      <p className="muted mt-2 max-w-[62ch] text-[0.88rem]">
        Conecta la salida de tu consola, mezclador o interfaz USB a la computadora, elige su entrada y pulsa «Conectar». Su sonido entra a la emisión junto con lo del estudio
        (pasa por el ecualizador y el limitador; baja cuando hablas por el micrófono del estudio).
      </p>
      <label className="mt-3 block">
        <span className="mono muted block">Entrada de audio</span>
        <select className="input w-full" value={deviceId} onChange={(e) => onDevice(e.target.value)} disabled={active} aria-label="Entrada de audio de la consola">
          <option value="">Predeterminada</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={active ? "btn" : "btn btn-accent"} onClick={active ? onStop : onStart}>
          {active ? "Desconectar" : "Conectar"}
        </button>
      </div>
      <PollMeter read={readLevel} label="Nivel de la consola" className="mt-3" />
      <label className="mono muted mt-3 flex items-center gap-2">
        Volumen
        <input type="range" className="studio-range flex-1" aria-label="Volumen de la consola" min={0} max={1.5} step={0.01} value={volume} onChange={(e) => onVolume(Number(e.target.value))} />
        <span>{Math.round(volume * 100)}%</span>
      </label>
      <p className="mono muted mt-3 text-[0.68rem]">
        Si oyes la consola por su propia salida (audífonos o altavoces del mezclador), deja el estudio en «Salida en silencio» para que no haya eco. La música de los decks sigue
        funcionando: si usas la consola como única fuente, no pongas pistas en la lista.
      </p>
      {error && (
        <p role="alert" className="mono mt-3 text-[var(--violet)]">
          {error}
        </p>
      )}
    </section>
  );
}
