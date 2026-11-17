"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicProgram } from "@/modules/schedule/public";
import { ScheduleModal } from "./ScheduleModal";
import { dayLabel, formatRange, todayBogota } from "./schedule-view";

type Item = { program: PublicProgram; startsAt: string; endsAt: string };

/**
 * Panel de la portada con la programación de hoy de StereoFace Radio (hora de Bogotá). Marca lo que está al aire y
 * se actualiza cada minuto; el botón abre la ventana completa (hoy, semana y mes) que ya existe en la barra de radio.
 */
export function TodaySchedule() {
  const [state, setState] = useState<{ date: string; items: Item[] | null } | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const date = todayBogota();
      fetch(`/api/radio/schedule?from=${date}&to=${date}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ items: Item[] }>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => alive && (setState({ date, items: d.items }), setNowMs(Date.now())))
        .catch(() => alive && (setState({ date, items: null }), setNowMs(Date.now())));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const items = (state?.items ?? []).filter((i) => Date.parse(i.endsAt) > nowMs - 0).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const all = state?.items ?? [];

  return (
    <section aria-labelledby="prog-hoy" className="mt-8 rounded-[12px] border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="mono text-accent-ink">StereoFace Radio</p>
          <h3 id="prog-hoy" className="display-up text-[1.25rem] leading-none">
            Programación de hoy
          </h3>
          {state && <p className="mono muted mt-1 capitalize">{dayLabel(state.date)}</p>}
        </div>
        <span aria-hidden="true" className="live-dot mt-1" />
      </div>

      {state === null ? (
        <div className="mt-4 grid gap-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-[8px] bg-panel-2" />
          ))}
        </div>
      ) : state.items === null ? (
        <p className="muted mt-4 text-[0.9rem]">No se pudo cargar la programación. Inténtalo de nuevo en un momento.</p>
      ) : all.length === 0 ? (
        <p className="muted mt-4 text-[0.9rem]">Hoy no hay programas en la parrilla. La radio sigue sonando con música.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {(items.length > 0 ? items : all).map((it) => {
            const on = Date.parse(it.startsAt) <= nowMs && nowMs < Date.parse(it.endsAt);
            const past = Date.parse(it.endsAt) <= nowMs;
            return (
              <li
                key={`${it.program.slug}-${it.startsAt}`}
                className="flex items-start gap-3 rounded-[10px] border px-3 py-2"
                style={{ borderColor: on ? it.program.color : "var(--line)", background: on ? "rgba(198,255,0,0.06)" : undefined, opacity: past ? 0.55 : 1 }}
              >
                <span className="mono shrink-0 pt-0.5 text-accent-ink">{formatRange(it.startsAt, it.endsAt)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/programas/${it.program.slug}`} className="font-bold leading-tight hover:text-accent-ink">
                      {it.program.name}
                    </Link>
                    {on && <span className="badge badge-ok">Al aire</span>}
                  </span>
                  {it.program.hosts && <span className="mono muted block text-[0.72rem]">Con {it.program.hosts}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" className="btn w-full" onClick={() => setOpen(true)}>
          Ver semana y mes
        </button>
        <Link href="/programas" className="btn w-full text-center">
          Todos los programas
        </Link>
      </div>
      <ScheduleModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
