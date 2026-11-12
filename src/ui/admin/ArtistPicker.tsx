"use client";

import { useState } from "react";

/** Selector de artistas con orden. Envía un input oculto `name` por cada artista, en el orden elegido. */
export function ArtistPicker({
  name = "artistIds",
  artists,
  initial,
  max,
  label,
  onChange,
  disabled = false,
}: {
  name?: string;
  artists: { id: string; name: string }[];
  initial: string[];
  max: number;
  label: string;
  /** Se llama con la lista completa cada vez que cambia (para formularios controlados). */
  onChange?: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [ids, setIds] = useState<string[]>(initial.filter((id) => artists.some((a) => a.id === id)));
  const [pick, setPick] = useState("");
  const nameOf = (id: string) => artists.find((a) => a.id === id)?.name ?? id;
  const available = artists.filter((a) => !ids.includes(a.id));
  const update = (next: string[]) => {
    setIds(next);
    onChange?.(next);
  };
  const move = (i: number, d: -1 | 1) => {
    const next = [...ids];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    update(next);
  };

  return (
    <fieldset>
      <legend className="mono mb-2 text-muted">{label}</legend>
      {ids.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {ids.length === 0 ? (
        <p className="text-muted">Ninguno elegido.</p>
      ) : (
        <ol className="grid gap-2">
          {ids.map((id, i) => (
            <li key={id} className="flex flex-wrap items-center gap-2">
              <span className="mono w-6 text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">{nameOf(id)}</span>
              <button type="button" className="btn !px-3 !py-1" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${nameOf(id)}`}>
                ↑
              </button>
              <button type="button" className="btn !px-3 !py-1" disabled={disabled || i === ids.length - 1} onClick={() => move(i, 1)} aria-label={`Bajar ${nameOf(id)}`}>
                ↓
              </button>
              <button type="button" className="btn !px-3 !py-1" disabled={disabled} onClick={() => update(ids.filter((x) => x !== id))} aria-label={`Quitar ${nameOf(id)}`}>
                Quitar
              </button>
            </li>
          ))}
        </ol>
      )}
      {!disabled && ids.length < max && (
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`${name}-pick`}>
            Añadir artista
          </label>
          <select id={`${name}-pick`} className="input max-w-xs" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Añadir artista…</option>
            {available.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn !px-4 !py-2"
            disabled={!pick}
            onClick={() => {
              update([...ids, pick]);
              setPick("");
            }}
          >
            Añadir
          </button>
        </div>
      )}
      <p className="mt-1 text-[0.78rem] text-muted">Hasta {max}.</p>
    </fieldset>
  );
}
