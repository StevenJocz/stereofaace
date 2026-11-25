"use client";

import { useEffect, useRef, useState } from "react";
import type { EventInput, EventView } from "@/modules/studio/events";
import type { CartView } from "@/modules/studio/carts";
import type { AzFile } from "@/modules/studio/azuracast";
import type { EventItem } from "@/modules/studio/schema";
import type { EventResult } from "./useStudioEvents";
import { eventDurationSec } from "./engine/scheduler";
import { formatRemaining } from "./zara-format";

const DAYS: [number, string, string][] = [
  [1, "L", "Lunes"],
  [2, "M", "Martes"],
  [3, "X", "Miércoles"],
  [4, "J", "Jueves"],
  [5, "V", "Viernes"],
  [6, "S", "Sábado"],
  [7, "D", "Domingo"],
];

const itemName = (i: EventItem) => (i.kind === "cart" ? i.name : i.artist ? `${i.artist} - ${i.title}` : i.title);

/** Busca en la biblioteca de AzuraCast (solo cuando hay 2 o más letras); se espera un momento a que termine de escribir. */
function useLibrarySearch(q: string): { files: AzFile[]; loading: boolean } {
  const [res, setRes] = useState<{ q: string; files: AzFile[] } | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/studio/library?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? (r.json() as Promise<{ files?: AzFile[] }>) : { files: [] }))
        .then((d) => setRes({ q: term, files: (d.files ?? []).slice(0, 8) }))
        .catch(() => !ctrl.signal.aborted && setRes({ q: term, files: [] }));
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  const term = q.trim();
  return { files: term.length >= 2 && res?.q === term ? res.files : [], loading: term.length >= 2 && res?.q !== term };
}

/**
 * Crear o editar un evento del programador: nombre, hora, días, cómo entra (Retardado / Fijo) y los audios que suenan,
 * que pueden ser jingles del Cart Wall o pistas de la biblioteca.
 */
export function EventEditor({ initial, carts, onClose, onSave }: { initial: EventView | null; carts: CartView[]; onClose: () => void; onSave: (input: EventInput, id?: string) => Promise<EventResult> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial?.name ?? "");
  const [time, setTime] = useState(initial?.time ?? "12:00");
  const [days, setDays] = useState<number[]>(initial?.days ?? [1, 2, 3, 4, 5, 6, 7]);
  const [mode, setMode] = useState<"delayed" | "fixed">(initial?.mode ?? "delayed");
  const [transition, setTransition] = useState<"fade" | "cut">(initial?.transition ?? "fade");
  const [active, setActive] = useState(initial?.active ?? true);
  const [items, setItems] = useState<EventItem[]>(initial?.items ?? []);
  const [query, setQuery] = useState("");
  const [cartPick, setCartPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { files, loading } = useLibrarySearch(query);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  const move = (i: number, by: -1 | 1) =>
    setItems((cur) => {
      const j = i + by;
      if (j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input: EventInput = {
      name,
      time,
      days,
      mode,
      transition,
      active,
      items: items.map((i) => (i.kind === "cart" ? { kind: "cart" as const, cartId: i.cartId } : { kind: "file" as const, azId: i.azId, title: i.title, artist: i.artist, durationSec: i.durationSec })),
    };
    const r = await onSave(input, initial?.id);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  };

  const total = eventDurationSec(items);
  return (
    <dialog ref={ref} className="studio-dialog zs-editor" onClose={onClose} aria-label={initial ? "Editar evento" : "Nuevo evento"}>
      <form onSubmit={(e) => void submit(e)} className="grid gap-3">
        <h2 className="display-up text-[1.4rem]">{initial ? "Editar evento" : "Nuevo evento"}</h2>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="mono muted block">Nombre</span>
            <input className="input !py-1.5" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ej.: Hora en punto, Promo del programa" autoFocus />
          </label>
          <label className="block">
            <span className="mono muted block">Hora (Bogotá)</span>
            <input className="input !py-1.5" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
          </label>
        </div>

        <fieldset>
          <legend className="mono muted">Días</legend>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {DAYS.map(([n, short, long]) => (
              <button key={n} type="button" className="zs-daybtn" aria-pressed={days.includes(n)} aria-label={long} title={long} onClick={() => toggleDay(n)}>
                {short}
              </button>
            ))}
            <button type="button" className="zs-linkbtn ml-2" onClick={() => setDays([1, 2, 3, 4, 5, 6, 7])}>
              Todos
            </button>
            <button type="button" className="zs-linkbtn" onClick={() => setDays([1, 2, 3, 4, 5])}>
              Lunes a viernes
            </button>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mono muted">Cómo entra</legend>
          <div className="mt-1 grid gap-1.5">
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "delayed"} onChange={() => setMode("delayed")} className="mt-1" />
              <span>
                <b>Retardado</b>
                <span className="muted block text-[0.8rem]">Entra cuando termina la pista que está sonando (con el fundido de siempre).</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "fixed"} onChange={() => setMode("fixed")} className="mt-1" />
              <span>
                <b>Fijo</b>
                <span className="muted block text-[0.8rem]">Entra a la hora exacta, aunque haya una pista sonando.</span>
              </span>
            </label>
            {mode === "fixed" && (
              <label className="ml-6 flex items-center gap-2 text-[0.85rem]">
                Al entrar:
                <select className="zs-selectbox" value={transition} onChange={(e) => setTransition(e.target.value as "fade" | "cut")}>
                  <option value="fade">fundido (6 s)</option>
                  <option value="cut">corte en seco</option>
                </select>
              </label>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mono muted">
            Audios del evento ({items.length}) · {formatRemaining(total).replace(/\.\d$/, "")}
          </legend>
          {items.length === 0 ? (
            <p className="zs-empty">Añade jingles del Cart Wall o pistas de la biblioteca. Suenan en este orden.</p>
          ) : (
            <ol className="zs-itemlist">
              {items.map((it, i) => (
                <li key={`${i}-${itemName(it)}`}>
                  <span className="zs-ico" aria-hidden="true">
                    {it.kind === "cart" ? "▣" : "♪"}
                  </span>
                  <span className="zs-row-text">{itemName(it)}</span>
                  <span className="zs-row-dur">{it.durationSec ? formatRemaining(it.durationSec).replace(/\.\d$/, "") : "--:--"}</span>
                  <button type="button" className="zs-iconbtn" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${itemName(it)}`}>
                    ↑
                  </button>
                  <button type="button" className="zs-iconbtn" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Bajar ${itemName(it)}`}>
                    ↓
                  </button>
                  <button type="button" className="zs-iconbtn" onClick={() => setItems((cur) => cur.filter((_, k) => k !== i))} aria-label={`Quitar ${itemName(it)}`}>
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mono muted block">Añadir un jingle</span>
              <select
                className="zs-selectbox w-full"
                value={cartPick}
                onChange={(e) => {
                  const c = carts.find((x) => x.id === e.target.value);
                  if (c) setItems((cur) => [...cur, { kind: "cart", cartId: c.id, name: c.name, durationSec: c.durationSec }]);
                  setCartPick("");
                }}
                disabled={carts.length === 0}
              >
                <option value="">{carts.length === 0 ? "No hay jingles en el Cart Wall" : "Elegir…"}</option>
                {carts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mono muted block">Añadir de la biblioteca</span>
              <input type="search" className="zs-search" placeholder="Título o artista" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          </div>
          {(files.length > 0 || loading) && (
            <ul className="zs-itemlist mt-1.5" aria-label="Resultados de la biblioteca">
              {loading && <li className="zs-empty">Buscando…</li>}
              {files.map((f) => (
                <li key={f.id}>
                  <span className="zs-ico" aria-hidden="true">
                    ♪
                  </span>
                  <span className="zs-row-text">{f.artist ? `${f.artist} - ${f.title}` : f.title}</span>
                  <span className="zs-row-dur">{f.durationSec ? formatRemaining(f.durationSec).replace(/\.\d$/, "") : "--:--"}</span>
                  <button
                    type="button"
                    className="zs-iconbtn"
                    onClick={() => setItems((cur) => [...cur, { kind: "file", azId: f.id, title: f.title, artist: f.artist, durationSec: f.durationSec }])}
                    aria-label={`Añadir ${f.title} al evento`}
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Evento activo
        </label>

        {error && (
          <p role="alert" className="mono text-[0.75rem] text-[#ff8a8a]">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-accent" disabled={saving}>
            {saving ? "Guardando…" : "Guardar evento"}
          </button>
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
        </div>
      </form>
    </dialog>
  );
}
