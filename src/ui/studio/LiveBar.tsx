"use client";

import { AirClock } from "./AirClock";
import { formatTime } from "./MeterBar";
import { PollMeter } from "./PollMeter";
import type { DjProgramInfo } from "@/modules/schedule/dj";
import { ProgramPicker } from "./ProgramPicker";
import { ShortcutsHelp } from "./ShortcutsHelp";
import type { LiveState } from "./engine/webcast";

const LABEL: Record<LiveState, string> = {
  offline: "Desconectado · suena el AutoDJ",
  connecting: "Conectando…",
  live: "EN VIVO",
  reconnecting: "Reconectando…",
  "auth-error": "Usuario o contraseña incorrectos",
  error: "Error de conexión",
};

export function LiveBar({
  state,
  user,
  password,
  onUser,
  onPassword,
  onToggle,
  elapsedSec,
  endsAt,
  readMaster,
  masterVolume,
  onMasterVolume,
  monitor,
  onMonitor,
  message,
  dj,
  programChoice,
  onProgramChoice,
}: {
  state: LiveState;
  user: string;
  password: string;
  onUser: (v: string) => void;
  onPassword: (v: string) => void;
  onToggle: () => void;
  elapsedSec: number;
  endsAt: number | null;
  readMaster: () => number;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  monitor: boolean;
  onMonitor: (v: boolean) => void;
  message: string | null;
  dj: DjProgramInfo | null;
  programChoice: string;
  onProgramChoice: (id: string) => void;
}) {
  const on = state === "live" || state === "connecting" || state === "reconnecting";
  return (
    <section className="studio-livebar panel" data-state={state} aria-label="Emisión">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-2">
          <p className="mono text-accent-ink">StereoFace Radio</p>
          <h1 className="display-up text-[1.5rem] leading-none">Estudio en vivo</h1>
        </div>
        <label className="block">
          <span className="mono muted block">Usuario DJ</span>
          <input className="input !py-1.5" value={user} onChange={(e) => onUser(e.target.value)} autoComplete="username" disabled={on} />
        </label>
        <label className="block">
          <span className="mono muted block">Contraseña</span>
          <input
            className="input !py-1.5"
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="current-password"
            disabled={on}
          />
        </label>
        {dj && <ProgramPicker dj={dj} programChoice={programChoice} onProgramChoice={onProgramChoice} />}
        <button type="button" className={on ? "btn" : "btn btn-accent"} onClick={onToggle} disabled={!on && (!user || !password)}>
          {on ? "Terminar" : "EN VIVO"}
        </button>
        <p className="studio-status" role="status" aria-live="polite">
          <span className="studio-dot" data-state={state} aria-hidden="true" />
          {LABEL[state]}
          {state === "live" && <span className="mono muted"> · {formatTime(elapsedSec)}</span>}
          {on && endsAt !== null && <AirClock endsAt={endsAt} className="ml-2 block text-[0.78rem]" />}
        </p>
        <div className="ml-auto flex min-w-[16rem] flex-1 items-center gap-4 sm:max-w-[34rem]">
          <div className="flex-1">
            <span className="mono muted">Master</span>
            <PollMeter read={readMaster} label="Nivel de salida (master)" className="mt-1" />
          </div>
          <label className="mono muted flex items-center gap-2">
            Vol
            <input
              type="range"
              aria-label="Volumen master"
              className="studio-range w-24"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => onMasterVolume(Number(e.target.value))}
            />
          </label>
          <ShortcutsHelp />
          <label className="mono muted flex items-center gap-2 whitespace-nowrap">
            <input type="checkbox" checked={monitor} onChange={(e) => onMonitor(e.target.checked)} /> Escuchar salida
          </label>
        </div>
      </div>
      {message && (
        <p role="alert" className="mono mt-2 text-[var(--violet)]">
          {message}
        </p>
      )}
    </section>
  );
}
