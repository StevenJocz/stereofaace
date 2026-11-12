"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProgram } from "@/modules/schedule/public";
import { addDays, dayLabel, formatRange, groupByDay, monthGrid, rangeFor, todayBogota, type ScheduleView } from "./schedule-view";

type Item = { program: PublicProgram; startsAt: string; endsAt: string };
type Loaded = { key: string; items: Item[] | null };

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function ProgramThumb({ p, size = "size-12" }: { p: PublicProgram; size?: string }) {
  return (
    <span className={`relative grid shrink-0 place-items-center overflow-hidden rounded-[8px] border border-line ${size}`} style={{ background: `linear-gradient(135deg, ${p.color}, #0c0c0c)` }}>
      {p.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
        <img src={p.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="display-up text-[1.1rem] text-black">{p.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

function ItemList({ items, nowMs }: { items: Item[]; nowMs: number }) {
  return (
    <ul className="mt-2 grid gap-2">
      {items.map((it) => {
        const on = Date.parse(it.startsAt) <= nowMs && nowMs < Date.parse(it.endsAt);
        return (
          <li key={`${it.program.slug}-${it.startsAt}`} className="flex items-start gap-3 rounded-[10px] border p-2.5" style={{ borderColor: on ? it.program.color : "var(--line)", background: on ? "rgba(198,255,0,0.06)" : undefined }}>
            <ProgramThumb p={it.program} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold">{it.program.name}</span>
                {on && <span className="badge badge-ok">Al aire</span>}
              </span>
              <span className="mono block text-accent-ink">{formatRange(it.startsAt, it.endsAt)}</span>
              {it.program.hosts && <span className="mono muted block">Con {it.program.hosts}</span>}
              {it.program.description && <span className="mt-1 block text-[0.88rem] text-muted">{it.program.description}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Ventana con la programación de StereoFace Radio: hoy, semana o mes. */
export function ScheduleModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<ScheduleView>("today");
  const [anchor, setAnchor] = useState(() => todayBogota());
  const [picked, setPicked] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const range = rangeFor(view, anchor);
  const key = `${range.from}|${range.to}`;

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`/api/radio/schedule?from=${range.from}&to=${range.to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { items: Item[] }) => {
        if (!alive) return;
        setLoaded({ key, items: d.items });
        setNowMs(Date.now());
      })
      .catch(() => alive && setLoaded({ key, items: null }));
    return () => {
      alive = false;
    };
  }, [open, key, range.from, range.to]);

  const fresh = loaded?.key === key ? loaded : null;
  const days = fresh?.items ? groupByDay(fresh.items) : [];
  const [y, m] = anchor.split("-").map(Number);

  const step = (dir: 1 | -1) => {
    setPicked(null);
    if (view === "today") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, 7 * dir));
    else setAnchor(`${m + dir < 1 ? y - 1 : m + dir > 12 ? y + 1 : y}-${String(((m - 1 + dir + 12) % 12) + 1).padStart(2, "0")}-01`);
  };

  const title = view === "month" ? `${MONTHS[m - 1]} de ${y}` : view === "today" ? dayLabel(anchor) : `${dayLabel(range.from)} – ${dayLabel(range.to)}`;
  const pickedDay = picked ? days.find((d) => d.date === picked) : null;

  return (
    <dialog ref={ref} className="schedule-dialog" aria-label="Programación de StereoFace Radio" onClose={onClose}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="mono text-accent-ink">StereoFace Radio</p>
          <h2 className="display-up text-[1.5rem] leading-none">Programación</h2>
        </div>
        <button type="button" className="btn !px-3 !py-1" onClick={onClose} aria-label="Cerrar la programación">
          Cerrar
        </button>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Vista" className="flex gap-1.5">
          {([["today", "Hoy"], ["week", "Semana"], ["month", "Mes"]] as const).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              type="button"
              aria-selected={view === v}
              className={view === v ? "btn btn-accent !px-3 !py-1" : "btn !px-3 !py-1"}
              onClick={() => {
                setView(v);
                setPicked(null);
                if (v === "today") setAnchor(todayBogota());
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn !px-3 !py-1" onClick={() => step(-1)} aria-label="Anterior">
            ←
          </button>
          <span className="mono min-w-[12rem] text-center capitalize">{title}</span>
          <button type="button" className="btn !px-3 !py-1" onClick={() => step(1)} aria-label="Siguiente">
            →
          </button>
        </div>
      </div>

      <div className="schedule-body mt-4">
        {!fresh && <p className="mono muted">Cargando programación…</p>}
        {fresh && fresh.items === null && (
          <p role="alert" className="mono text-[var(--violet)]">
            No se pudo cargar la programación. Inténtalo de nuevo en un momento.
          </p>
        )}
        {fresh?.items && fresh.items.length === 0 && <p className="studio-empty">Aún no hay programación publicada para este periodo.</p>}

        {fresh?.items && fresh.items.length > 0 && view !== "month" &&
          days.map((d) => (
            <section key={d.date} aria-label={d.label} className="mb-4">
              {view === "week" && <h3 className="display-up text-[1.05rem] capitalize">{d.label}</h3>}
              <ItemList items={d.items} nowMs={nowMs} />
            </section>
          ))}

        {fresh?.items && view === "month" && (
          <>
            <div className="schedule-month" role="group" aria-label="Calendario del mes">
              {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
                <span key={d} className="mono muted text-center">
                  {d}
                </span>
              ))}
              {monthGrid(y, m).map((c) => {
                const has = days.find((d) => d.date === c.date);
                return (
                  <button
                    key={c.date}
                    type="button"
                    className="schedule-day"
                    data-out={!c.inMonth}
                    data-today={c.date === todayBogota()}
                    aria-pressed={picked === c.date}
                    aria-label={`${dayLabel(c.date)}${has ? `, ${has.items.length} programas` : ", sin programación"}`}
                    onClick={() => setPicked(c.date)}
                  >
                    <span>{Number(c.date.slice(8))}</span>
                    {has && (
                      <span className="schedule-dots" aria-hidden="true">
                        {has.items.slice(0, 4).map((i, k) => (
                          <i key={k} style={{ background: i.program.color }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              {picked ? (
                <>
                  <h3 className="display-up text-[1.05rem] capitalize">{dayLabel(picked)}</h3>
                  {pickedDay ? <ItemList items={pickedDay.items} nowMs={nowMs} /> : <p className="mono muted mt-2">Sin programación este día.</p>}
                </>
              ) : (
                <p className="mono muted">Elige un día para ver sus programas.</p>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
