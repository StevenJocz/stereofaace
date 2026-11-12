"use client";

import { MeterBar, formatTime } from "./MeterBar";
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
  masterDb,
  masterVolume,
  onMasterVolume,
  monitor,
  onMonitor,
  message,
}: {
  state: LiveState;
  user: string;
  password: string;
  onUser: (v: string) => void;
  onPassword: (v: string) => void;
  onToggle: () => void;
  elapsedSec: number;
  masterDb: number;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  monitor: boolean;
  onMonitor: (v: boolean) => void;
  message: string | null;
}) {
  const on = state === "live" || state === "connecting" || state === "reconnecting";
  return (
    <section className="studio-livebar panel" data-state={state} aria-label="Emisión">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mono muted block">Usuario DJ</span>
          <input className="input" value={user} onChange={(e) => onUser(e.target.value)} autoComplete="username" disabled={on} />
        </label>
        <label className="block">
          <span className="mono muted block">Contraseña</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            autoComplete="current-password"
            disabled={on}
          />
        </label>
        <button
          type="button"
          className={on ? "btn" : "btn btn-accent"}
          onClick={onToggle}
          disabled={!on && (!user || !password)}
        >
          {on ? "Terminar" : "EN VIVO"}
        </button>
        <p className="studio-status" role="status" aria-live="polite">
          <span className="studio-dot" data-state={state} aria-hidden="true" />
          {LABEL[state]}
          {state === "live" && <span className="mono muted"> · {formatTime(elapsedSec)}</span>}
        </p>
      </div>
      {message && (
        <p role="alert" className="mono mt-2 text-[var(--violet)]">
          {message}
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <div>
          <span className="mono muted">Master</span>
          <MeterBar db={masterDb} label="Nivel de salida (master)" className="mt-1" />
        </div>
        <div className="flex items-center gap-4">
          <label className="mono muted flex items-center gap-2">
            Vol
            <input
              type="range"
              aria-label="Volumen master"
              className="studio-range"
              min={0}
              max={1}
              step={0.01}
              value={masterVolume}
              onChange={(e) => onMasterVolume(Number(e.target.value))}
            />
          </label>
          <label className="mono muted flex items-center gap-2">
            <input type="checkbox" checked={monitor} onChange={(e) => onMonitor(e.target.checked)} /> Escuchar salida
          </label>
        </div>
      </div>
    </section>
  );
}
