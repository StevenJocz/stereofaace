"use client";

import { formatTime } from "./MeterBar";
import { PollMeter } from "./PollMeter";
import type { DjProgramInfo, StudioProgram } from "@/modules/schedule/dj";
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
  const choices: StudioProgram[] = dj ? [...(dj.scheduled ? [dj.scheduled.program] : []), ...dj.others] : [];
  const chosen = programChoice ? choices.find((p) => p.id === programChoice) : dj?.scheduled?.program;
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false });
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
        {dj && (chosen || dj.next || choices.length > 0) && (
          <div className="studio-program" aria-label="Programa">
            {chosen ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-panel-2">
                  {chosen.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
                    <img src={chosen.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : (
                    <span className="display-up text-[1rem]">{chosen.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="min-w-0" title={chosen.description ?? undefined}>
                  <span className="mono block text-[0.62rem] text-accent-ink">
                    {programChoice ? "Emitiendo como" : "Tu programa"}
                    {!programChoice && dj.scheduled ? ` · hasta ${hhmm(dj.scheduled.endsAt)}` : ""}
                  </span>
                  <span className="block truncate font-bold leading-tight">{chosen.name}</span>
                </span>
              </span>
            ) : dj.next ? (
              <span className="mono muted block">
                Tu próximo programa: <span className="text-fg">{dj.next.program.name}</span> a las {hhmm(dj.next.startsAt)}
              </span>
            ) : null}
            {choices.length > 0 && (
              <label className="block">
                <span className="sr-only">Emitir como</span>
                <select className="input !py-1 !text-[0.8rem]" value={programChoice} onChange={(e) => onProgramChoice(e.target.value)} aria-label="Emitir como">
                  <option value="">{dj.scheduled ? "Según mi horario" : "Sin programa"}</option>
                  {choices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <button type="button" className={on ? "btn" : "btn btn-accent"} onClick={onToggle} disabled={!on && (!user || !password)}>
          {on ? "Terminar" : "EN VIVO"}
        </button>
        <p className="studio-status" role="status" aria-live="polite">
          <span className="studio-dot" data-state={state} aria-hidden="true" />
          {LABEL[state]}
          {state === "live" && <span className="mono muted"> · {formatTime(elapsedSec)}</span>}
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
