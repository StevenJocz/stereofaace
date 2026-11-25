"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CartView } from "@/modules/studio/carts";
import type { EventInput, EventView, HoursInput } from "@/modules/studio/events";
import type { PublicProgram } from "@/modules/schedule/public";
import { todayBogota } from "@/ui/radio/schedule-view";
import { EventEditor } from "./EventEditor";
import { HourAnnouncements } from "./HourAnnouncements";
import { GRACE_MS, bogotaMidnight, eventDurationSec, nextOccurrence, todaysEvents } from "./engine/scheduler";
import type { EventResult, EventsState, HoursOutcome } from "./useStudioEvents";
import { formatClock, formatRemaining } from "./zara-format";
import { useClock, ZaraWindow } from "./ZaraWindow";

type Item = { program: PublicProgram; startsAt: string; endsAt: string };

/** Programación de hoy (la parrilla de la radio), se refresca cada minuto. `null` = no se pudo cargar. */
function useTodaySchedule(active: boolean): Item[] | null | undefined {
  const [items, setItems] = useState<Item[] | null | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
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
  }, [active]);
  return items;
}

const Svg = ({ children, size = 17 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const clockIcon = (
  <Svg size={15}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const noteIcon = (
  <Svg size={14}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Svg>
);

const MODE_LABEL = { delayed: "Retardado", fixed: "Fijo" } as const;
const itemLabel = (i: EventView["items"][number]) => (i.kind === "cart" ? i.name : i.artist ? `${i.artist} - ${i.title}` : i.title);
const dur = (s: number | null) => (s && Number.isFinite(s) ? formatRemaining(s).replace(/\.\d$/, "") : "--:--");

/** Etiqueta de cuándo es el próximo evento si no es hoy («mañana», «mié»…). */
function dayHint(atMs: number, nowMs: number): string {
  const days = Math.round((bogotaMidnight(atMs) - bogotaMidnight(nowMs)) / 86_400_000);
  if (days <= 0) return "";
  if (days === 1) return "mañana";
  return new Intl.DateTimeFormat("es-CO", { weekday: "short", timeZone: "America/Bogota" }).format(atMs).replace(".", "");
}

/** La parrilla de programas del día, como bloques por hora (el en curso en verde). */
function GridTab() {
  const items = useTodaySchedule(true);
  const now = useClock(1000);
  const listRef = useRef<HTMLUListElement>(null);
  const list = items ?? [];
  const current = list.find((i) => Date.parse(i.startsAt) <= now && now < Date.parse(i.endsAt)) ?? null;
  const next = list.find((i) => Date.parse(i.startsAt) > now) ?? null;
  const remainingSec = current ? (Date.parse(current.endsAt) - now) / 1000 : null;
  const blockSec = current ? (Date.parse(current.endsAt) - Date.parse(current.startsAt)) / 1000 : null;
  const currentKey = current ? `${current.program.slug}-${current.startsAt}` : "";

  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-state="now"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - box.clientHeight / 4);
  }, [currentKey, items]);

  return (
    <>
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
    </>
  );
}

/**
 * «Eventos»: el programador del estudio, como en ZaraStudio. Cada evento entra a una hora y en ciertos días con su bloque de
 * audios (jingles o pistas): «Retardado» espera a que termine la pista que suena, «Fijo» entra a su hora exacta. Se disparan
 * solos mientras se emite en vivo. La pestaña «Parrilla» muestra los programas del día.
 */
export function EventsPanel({
  events,
  state,
  carts,
  fired,
  schedulerOn,
  onSchedulerOn,
  live,
  onFire,
  onSave,
  onDelete,
  onSaveHours,
}: {
  events: EventView[];
  state: EventsState;
  carts: CartView[];
  /** Claves («id:fecha») de los eventos que ya se dispararon hoy en esta consola. */
  fired: ReadonlySet<string>;
  schedulerOn: boolean;
  onSchedulerOn: (v: boolean) => void;
  /** Se está emitiendo en vivo: solo entonces los eventos se disparan solos. */
  live: boolean;
  onFire: (ev: EventView) => void;
  onSave: (input: EventInput, id?: string) => Promise<EventResult>;
  onDelete: (id: string) => Promise<EventResult>;
  onSaveHours: (input: HoursInput) => Promise<HoursOutcome>;
}) {
  const now = useClock(1000);
  const [tab, setTab] = useState<"events" | "grid">("events");
  const [selected, setSelected] = useState<string | null>(null);
  /** `undefined` = editor cerrado; `null` = evento nuevo; si no, el evento que se edita. */
  const [editing, setEditing] = useState<EventView | null | undefined>(undefined);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const sched = events; // EventView ya trae los campos del programador
  const today = now ? todaysEvents(sched, now) : [];
  const next = now ? nextOccurrence(sched, now) : null;
  const sel = selected ? (byId.get(selected) ?? null) : null;
  const nextEvent = next ? byId.get(next.event.id) : null;
  const remainingSec = next ? (next.atMs - now) / 1000 : null;
  const nextKey = next?.key ?? "";

  // El próximo evento queda a la vista.
  useEffect(() => {
    const box = listRef.current;
    const el = box?.querySelector<HTMLElement>('[data-next="true"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - box.clientHeight / 4);
  }, [nextKey, events.length, tab]);

  const status = !schedulerOn ? "Programador pausado: no se dispara nada solo." : live ? "Programador activo: los eventos entran solos." : "En espera: los eventos se disparan cuando estés EN VIVO.";

  return (
    <ZaraWindow title="Eventos" tone="blue" className="zs-events">
      <div className="zs-tabs zs-tabs-sm" role="tablist" aria-label="Eventos">
        <button type="button" role="tab" className="zs-tab" aria-selected={tab === "events"} onClick={() => setTab("events")}>
          Eventos
        </button>
        <button type="button" role="tab" className="zs-tab" aria-selected={tab === "grid"} onClick={() => setTab("grid")}>
          Parrilla
        </button>
      </div>

      {tab === "grid" ? (
        <GridTab />
      ) : (
        <>
          <div className="zs-iconbar">
            <button type="button" className="zs-iconbtn" onClick={() => setEditing(null)} aria-label="Nuevo evento" title="Nuevo evento">
              <Svg>
                <path d="M12 5v14M5 12h14" />
              </Svg>
            </button>
            <button type="button" className="zs-iconbtn" onClick={() => sel && setEditing(sel)} disabled={!sel?.canEdit} aria-label="Editar el evento seleccionado" title="Editar">
              <Svg>
                <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
              </Svg>
            </button>
            <button
              type="button"
              className="zs-iconbtn"
              onClick={async () => {
                if (!sel || !window.confirm(`¿Borrar el evento «${sel.name}»?`)) return;
                const r = await onDelete(sel.id);
                setNotice(r.ok ? null : r.error);
                if (r.ok) setSelected(null);
              }}
              disabled={!sel?.canEdit}
              aria-label="Borrar el evento seleccionado"
              title="Borrar"
            >
              <Svg>
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
              </Svg>
            </button>
            <button type="button" className="zs-iconbtn" onClick={() => sel && onFire(sel)} disabled={!sel} aria-label="Ejecutar ahora el evento seleccionado" title="Ejecutar ahora">
              <Svg>
                <path d="M7 5v14l12-7z" fill="currentColor" />
              </Svg>
            </button>
            <button type="button" className="zs-iconbtn" onClick={() => setHoursOpen(true)} aria-label="Anuncios de la hora" title="Anuncios de la hora">
              <Svg>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7v5l3.5 2" />
                <path d="M3 5l2-2M21 5l-2-2" />
              </Svg>
            </button>
            <span className="zs-spacer" />
            <label className="zs-select" title="Pausa o reanuda los disparos automáticos">
              <span className="sr-only">Programador</span>
              <select value={schedulerOn ? "on" : "off"} onChange={(e) => onSchedulerOn(e.target.value === "on")}>
                <option value="on">Auto</option>
                <option value="off">Pausado</option>
              </select>
            </label>
          </div>

          <div className="zs-counter">
            <div className="zs-counter-cell">
              <span className="zs-label">Tiempo restante</span>
              <strong className="zs-big" data-dim={next ? undefined : true}>
                {formatRemaining(remainingSec ?? 0)}
              </strong>
            </div>
            <div className="zs-counter-cell zs-counter-end">
              <span className="zs-label">Hora del evento{next && dayHint(next.atMs, now) ? ` (${dayHint(next.atMs, now)})` : ""}</span>
              <strong className="zs-mid">{next ? formatClock(next.atMs) : "--:--:--"}</strong>
            </div>
          </div>
          <p className="zs-meta">
            <span>
              Duración bloque: <b>{formatRemaining(nextEvent ? eventDurationSec(nextEvent.items) : 0)}</b>
            </span>
            <span>{nextEvent ? <b>{MODE_LABEL[nextEvent.mode]}</b> : "Sin eventos por venir"}</span>
          </p>
          <div className="zs-current" title={nextEvent?.name ?? ""}>
            {nextEvent ? nextEvent.name : "No hay eventos programados"}
          </div>
          <p className="zs-note zs-status-note" data-on={schedulerOn && live ? "true" : undefined}>
            {status}
          </p>
          {notice && (
            <p role="alert" className="zs-note">
              {notice}
            </p>
          )}

          {state === "loading" ? (
            <p className="zs-empty">Cargando los eventos…</p>
          ) : state === "error" ? (
            <p className="zs-empty" role="alert">
              No se pudieron cargar los eventos.
            </p>
          ) : today.length === 0 ? (
            <div className="zs-empty">
              {events.length === 0 ? "Aún no hay eventos." : "Hoy no hay eventos."}{" "}
              <button type="button" className="zs-linkbtn" onClick={() => setEditing(null)}>
                Crear un evento
              </button>
            </div>
          ) : (
            <ul className="zs-list" ref={listRef} aria-label="Eventos de hoy">
              {today.map((o) => {
                const ev = byId.get(o.event.id)!;
                const isFired = fired.has(o.key);
                const missed = !isFired && ev.active && o.atMs + GRACE_MS[ev.mode] < now;
                const isNext = o.key === nextKey;
                const st = !ev.active ? "off" : isFired ? "done" : missed ? "missed" : isNext ? "next" : "later";
                return (
                  <li
                    key={o.key}
                    className="zs-block"
                    data-ev={st}
                    data-next={isNext || undefined}
                    data-selected={selected === ev.id || undefined}
                    onClick={() => setSelected(ev.id)}
                    onDoubleClick={() => ev.canEdit && setEditing(ev)}
                    title={ev.canEdit ? "Clic: seleccionar · doble clic: editar" : "Lo creó otra persona: solo puede cambiarlo su autor o quien gestiona la emisora"}
                  >
                    <div className="zs-row zs-row-head" aria-current={isNext ? "true" : undefined}>
                      <span className="zs-ico">{clockIcon}</span>
                      <span className="zs-row-text">
                        {formatClock(o.atMs)} – {ev.name}
                      </span>
                      <span className="zs-row-dur">{!ev.active ? "Pausado" : isFired ? "Listo" : missed ? "Omitido" : MODE_LABEL[ev.mode]}</span>
                    </div>
                    {ev.items.map((it, i) => (
                      <div key={i} className="zs-row zs-row-item">
                        <span className="zs-ico">{noteIcon}</span>
                        <span className="zs-row-text">{itemLabel(it)}</span>
                        <span className="zs-row-dur">{dur(it.durationSec)}</span>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {hoursOpen && <HourAnnouncements events={events} carts={carts} onClose={() => setHoursOpen(false)} onSave={onSaveHours} />}
      {editing !== undefined && <EventEditor key={editing?.id ?? "nuevo"} initial={editing} carts={carts} onClose={() => setEditing(undefined)} onSave={onSave} />}
    </ZaraWindow>
  );
}
