"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicProgram } from "@/modules/schedule/public";
import { todayBogota } from "@/ui/radio/schedule-view";
import { formatClock, formatRemaining } from "./zara-format";
import { useClock, ZaraWindow } from "./ZaraWindow";

type Item = { program: PublicProgram; startsAt: string; endsAt: string };

/** Programación de hoy (la parrilla de la radio), se refresca cada minuto. `null` = no se pudo cargar. */
function useTodaySchedule(): Item[] | null | undefined {
  const [items, setItems] = useState<Item[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    const load = () => {
      const date = todayBogota();
      fetch(`/api/radio/schedule?from=${date}&to=${date}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ items: Item[] }>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => alive && setItems([...d.items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))))
        .catch(() => alive && setItems(null));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return items;
}

const clockIcon = (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3 2" />
  </svg>
);
const noteIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </svg>
);

/**
 * «Eventos»: la parrilla del día como bloques por hora. El bloque en curso va en verde con cuánto falta y a qué hora termina;
 * los siguientes en gris y los que ya pasaron atenuados.
 */
export function EventsPanel() {
  const items = useTodaySchedule();
  const now = useClock(1000);
  const listRef = useRef<HTMLUListElement>(null);

  const list = items ?? [];
  const current = list.find((i) => Date.parse(i.startsAt) <= now && now < Date.parse(i.endsAt)) ?? null;
  const next = list.find((i) => Date.parse(i.startsAt) > now) ?? null;
  const remainingSec = current ? (Date.parse(current.endsAt) - now) / 1000 : null;
  const blockSec = current ? (Date.parse(current.endsAt) - Date.parse(current.startsAt)) / 1000 : null;
  const currentKey = current ? `${current.program.slug}-${current.startsAt}` : "";

  // El bloque en curso queda a la vista (en el primer tercio de la lista) sin mover la página.
  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-state="now"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - box.clientHeight / 4);
  }, [currentKey, items]);

  return (
    <ZaraWindow title="Eventos" tone="blue" className="zs-events">
      <div className="zs-counter">
        <div className="zs-counter-cell">
          <span className="zs-label">Tiempo restante</span>
          <strong className="zs-big" data-dim={current ? undefined : true}>
            {formatRemaining(remainingSec ?? 0)}
          </strong>
        </div>
        <div className="zs-counter-cell zs-counter-end">
          <span className="zs-label">Hora fin bloque</span>
          <strong className="zs-mid">{current ? formatClock(Date.parse(current.endsAt)) : "--:--:--"}</strong>
        </div>
      </div>
      <p className="zs-meta">
        <span>
          Duración bloque: <b>{formatRemaining(blockSec ?? 0)}</b>
        </span>
        <span>
          {next ? (
            <>
              Sigue: <b>{next.program.name}</b> · {formatClock(Date.parse(next.startsAt))}
            </>
          ) : (
            "No hay más bloques hoy"
          )}
        </span>
      </p>
      <div className="zs-current" title={current?.program.name ?? ""}>
        {current ? current.program.name : "Sin programa al aire: suena la música automática"}
      </div>

      {items === undefined ? (
        <p className="zs-empty">Cargando la programación…</p>
      ) : items === null ? (
        <p className="zs-empty" role="alert">
          No se pudo cargar la programación.
        </p>
      ) : list.length === 0 ? (
        <p className="zs-empty">Hoy no hay programas en la parrilla.</p>
      ) : (
        <ul className="zs-list" ref={listRef} aria-label="Programación de hoy">
          {list.map((it) => {
            const state = Date.parse(it.startsAt) <= now && now < Date.parse(it.endsAt) ? "now" : Date.parse(it.endsAt) <= now ? "past" : "next";
            return (
              <li key={`${it.program.slug}-${it.startsAt}`} data-state={state} className="zs-block">
                <div className="zs-row zs-row-head">
                  <span className="zs-ico">{clockIcon}</span>
                  <span className="zs-row-text">
                    {formatClock(Date.parse(it.startsAt))} – {it.program.name}
                  </span>
                  <span className="zs-row-dur">{state === "now" ? "Al aire" : state === "past" ? "Pasó" : ""}</span>
                </div>
                {it.program.hosts && (
                  <div className="zs-row">
                    <span className="zs-ico">{noteIcon}</span>
                    <span className="zs-row-text">Con {it.program.hosts}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ZaraWindow>
  );
}
