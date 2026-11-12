"use client";

import type { DjProgramInfo, StudioProgram } from "@/modules/schedule/dj";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false });

/** Programa que le toca al DJ (o el próximo) y selector «Emitir como». Se usa en la entrada al estudio y en la barra de emisión. */
export function ProgramPicker({ dj, programChoice, onProgramChoice }: { dj: DjProgramInfo; programChoice: string; onProgramChoice: (id: string) => void }) {
  const choices: StudioProgram[] = [...(dj.scheduled ? [dj.scheduled.program] : []), ...dj.others];
  const chosen = programChoice ? choices.find((p) => p.id === programChoice) : dj.scheduled?.program;
  if (!chosen && !dj.next && choices.length === 0) return null;
  return (
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
  );
}
