"use client";

import { useEffect, useRef, useState } from "react";
import type { CartView } from "@/modules/studio/carts";
import type { EventView, HoursInput } from "@/modules/studio/events";
import { guessHourCart, parseHourEvent } from "./engine/hours";
import type { HoursOutcome } from "./useStudioEvents";

const DAYS: [number, string, string][] = [
  [1, "L", "Lunes"],
  [2, "M", "Martes"],
  [3, "X", "Miércoles"],
  [4, "J", "Jueves"],
  [5, "V", "Viernes"],
  [6, "S", "Sábado"],
  [7, "D", "Domingo"],
];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const label = (h: number) => `${String(h).padStart(2, "0")}:00`;

/**
 * Anuncios de la hora: eliges, para cada hora, el jingle que dice «son las…» (se suben al Cart Wall) y se crean de una vez los
 * eventos «Hora · HH:MM» que los disparan. Retardado = entra al terminar la pista; Fijo = entra a la hora exacta.
 */
export function HourAnnouncements({ events, carts, onClose, onSave }: { events: EventView[]; carts: CartView[]; onClose: () => void; onSave: (input: HoursInput) => Promise<HoursOutcome> }) {
  const ref = useRef<HTMLDialogElement>(null);
  const existing = events.map((e) => ({ e, p: parseHourEvent(e.name) })).filter((x): x is { e: EventView; p: { hour: number; minute: number } } => x.p !== null);
  const first = existing[0]?.e;
  const [choice, setChoice] = useState<Record<number, string>>(() => {
    const out: Record<number, string> = {};
    for (const { e, p } of existing) {
      const it = e.items[0];
      if (it?.kind === "cart" && !(p.hour in out)) out[p.hour] = it.cartId;
    }
    return out;
  });
  const [mode, setMode] = useState<"delayed" | "fixed">(first?.mode ?? "delayed");
  const [transition, setTransition] = useState<"fade" | "cut">(first?.transition ?? "fade");
  const [minute, setMinute] = useState(existing[0]?.p.minute ?? 0);
  const [days, setDays] = useState<number[]>(first?.days ?? [1, 2, 3, 4, 5, 6, 7]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  const autoAssign = () => {
    const next = { ...choice };
    let found = 0;
    for (const h of HOURS) {
      if (next[h]) continue;
      const id = guessHourCart(carts, h);
      if (id) {
        next[h] = id;
        found++;
      }
    }
    setChoice(next);
    setMessage({ ok: found > 0, text: found > 0 ? `Se asignaron ${found} horas por el nombre del jingle.` : "Ningún jingle tiene un nombre como «Hora 14», «14:00» o «2 pm»." });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    const r = await onSave(toInput({ choice, mode, transition, minute, days }));
    setSaving(false);
    if (!r.ok) return setMessage({ ok: false, text: r.error });
    const { created, updated, removed, skipped } = r.result;
    setMessage({
      ok: true,
      text: `Listo: ${created} creados, ${updated} actualizados, ${removed} quitados.${skipped.length ? ` No se pudieron cambiar (son de otra persona): ${skipped.join(", ")}.` : ""}`,
    });
  };

  const assigned = Object.values(choice).filter(Boolean).length;
  return (
    <dialog ref={ref} className="studio-dialog zs-editor zs-hours" onClose={onClose} aria-label="Anuncios de la hora">
      <form onSubmit={(e) => void submit(e)} className="grid gap-3">
        <h2 className="display-up text-[1.4rem]">Anuncios de la hora</h2>
        <p className="muted text-[0.85rem]">
          Elige para cada hora el jingle que dice la hora. Súbelos al Cart Wall con nombres como «Hora 14», «14:00» o «2 pm» y pulsa «Asignar por nombre».
          Se crea un evento por hora; las horas sin jingle no tienen anuncio.
        </p>

        <div className="grid gap-3 sm:grid-cols-[auto_auto_1fr]">
          <fieldset>
            <legend className="mono muted">Cómo entra</legend>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" name="hmode" checked={mode === "delayed"} onChange={() => setMode("delayed")} /> Retardado (al terminar la pista)
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="hmode" checked={mode === "fixed"} onChange={() => setMode("fixed")} /> Fijo (a la hora exacta)
            </label>
            {mode === "fixed" && (
              <select className="zs-selectbox mt-1" value={transition} onChange={(e) => setTransition(e.target.value as "fade" | "cut")} aria-label="Transición del evento Fijo">
                <option value="fade">con fundido</option>
                <option value="cut">en seco</option>
              </select>
            )}
          </fieldset>
          <label className="block">
            <span className="mono muted block">Minuto</span>
            <input className="input !w-20 !py-1.5" type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))} />
            <span className="muted text-[0.75rem]">0 = en punto</span>
          </label>
          <fieldset>
            <legend className="mono muted">Días</legend>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {DAYS.map(([n, short, long]) => (
                <button key={n} type="button" className="zs-daybtn" aria-pressed={days.includes(n)} aria-label={long} title={long} onClick={() => toggleDay(n)}>
                  {short}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn !px-3 !py-1.5" onClick={autoAssign} disabled={carts.length === 0}>
            Asignar por nombre
          </button>
          <button type="button" className="btn !px-3 !py-1.5" onClick={() => setChoice({})} disabled={assigned === 0}>
            Vaciar
          </button>
          <span className="mono muted text-[0.75rem]">{assigned} de 24 horas con anuncio</span>
        </div>

        <ul className="zs-hours-grid" aria-label="Jingle de cada hora">
          {HOURS.map((h) => (
            <li key={h}>
              <label>
                <span className="zs-hours-label">{label(h)}</span>
                <select className="zs-selectbox" value={choice[h] ?? ""} onChange={(e) => setChoice((c) => ({ ...c, [h]: e.target.value }))} aria-label={`Jingle de las ${label(h)}`}>
                  <option value="">— sin anuncio —</option>
                  {carts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          ))}
        </ul>

        {message && (
          <p role={message.ok ? "status" : "alert"} className={`mono text-[0.75rem] ${message.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
            {message.text}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-accent" disabled={saving || carts.length === 0}>
            {saving ? "Guardando…" : "Guardar anuncios"}
          </button>
          <button type="button" className="btn" onClick={() => ref.current?.close()}>
            Cerrar
          </button>
        </div>
      </form>
    </dialog>
  );
}

function toInput(s: { choice: Record<number, string>; mode: "delayed" | "fixed"; transition: "fade" | "cut"; minute: number; days: number[] }) {
  return {
    mode: s.mode,
    transition: s.transition,
    minute: s.minute,
    days: s.days,
    hours: HOURS.map((h) => ({ hour: h, cartId: s.choice[h] || null })),
  };
}
