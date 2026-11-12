"use client";

import { useState } from "react";
import { MediaUpload, type UploadedMedia } from "./MediaUpload";

type Item = { id: string; url: string; alt: string };

const rel = (url: string) => `/media/${url.split("/media/")[1] ?? ""}`;

/**
 * Selector de imagen de la biblioteca. Envía el id del medio en un input oculto con el nombre dado.
 * Permite elegir una existente, subir una nueva o quitar la actual.
 */
export function MediaPicker({
  name,
  label,
  initial,
}: {
  name: string;
  label: string;
  initial?: { id: string; url: string } | null;
}) {
  const [selected, setSelected] = useState<{ id: string; url: string } | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (q: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/media?search=${encodeURIComponent(q)}`);
      const data = (await r.json()) as { items?: Item[]; error?: string };
      if (!r.ok) throw new Error(data.error ?? "No se pudo cargar la biblioteca.");
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la biblioteca.");
    }
  };

  const choose = (m: { id: string; url: string }) => {
    setSelected({ id: m.id, url: m.url });
    setOpen(false);
  };

  return (
    <div>
      <p className="mono mb-1 text-muted">{label}</p>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        {selected ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo propio servido por /media
          <img src={rel(selected.url)} alt="" className="h-20 w-28 rounded-[6px] border border-line object-cover" />
        ) : (
          <span className="mono text-muted">Sin imagen</span>
        )}
        <button
          type="button"
          className="btn !px-4 !py-2"
          onClick={() => {
            setOpen((o) => !o);
            if (items === null) void load("");
          }}
        >
          {open ? "Cerrar biblioteca" : "Elegir de la biblioteca"}
        </button>
        {selected && (
          <button type="button" className="btn !px-4 !py-2" onClick={() => setSelected(null)}>
            Quitar
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 rounded-[6px] border border-line p-3">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`${name}-search`}>Buscar imágenes</label>
            <input
              id={`${name}-search`}
              className="input max-w-xs"
              value={search}
              placeholder="Buscar"
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void load(search);
                }
              }}
            />
            <button type="button" className="btn !px-4 !py-2" onClick={() => void load(search)}>
              Buscar
            </button>
          </div>
          {error && (
            <p role="alert" className="mono mt-2 text-[#ff8a8a]">
              {error}
            </p>
          )}
          {items && items.length === 0 && <p className="mt-3 text-muted">No hay imágenes.</p>}
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {items?.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => choose(m)} className="block w-full" aria-label={`Elegir ${m.alt}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- archivo propio servido por /media */}
                  <img src={rel(m.url)} alt={m.alt} className="aspect-square w-full rounded-[6px] border border-line object-cover hover:border-accent-ink" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <MediaUpload
              label="Subir imagen nueva"
              onUploaded={(m: UploadedMedia) => {
                choose(m);
                setItems(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
