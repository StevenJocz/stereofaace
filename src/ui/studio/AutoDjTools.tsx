"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProgramAdminView, SlotAdminView } from "@/modules/schedule/service";
import { LibraryManager } from "@/ui/admin/LibraryManager";
import { ProgramForm, SchedulePreview, SlotForm } from "@/ui/admin/ProgramForms";

type Parrilla = { programs: ProgramAdminView[]; slots: SlotAdminView[] };
type LoadState = "loading" | "ready" | "error";

/** Programas y horarios de la emisora; se vuelven a pedir cuando un formulario guarda algo. */
function useParrilla() {
  const [data, setData] = useState<Parrilla>({ programs: [], slots: [] });
  const [state, setState] = useState<LoadState>("loading");
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/studio/parrilla", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as Parrilla);
      setState("ready");
    } catch {
      setState((s) => (s === "ready" ? s : "error"));
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload]);
  return { ...data, state, reload };
}

/** Parrilla semanal, alta de horarios y programas (con su DJ, imagen y color): lo mismo que «Programación» del administrador. */
function GridTab({ canDelete }: { canDelete: boolean }) {
  const { programs, slots, state, reload } = useParrilla();
  if (state === "loading") return <p className="zs-empty">Cargando la programación…</p>;
  if (state === "error")
    return (
      <p role="alert" className="zs-empty">
        No se pudo cargar la programación.{" "}
        <button type="button" className="zs-linkbtn" onClick={() => void reload()}>
          Reintentar
        </button>
      </p>
    );
  return (
    <div className="grid gap-8">
      <p className="muted max-w-[75ch] text-[0.9rem]">
        La parrilla manda sobre el AutoDJ: la música de cada programa (su lista en AzuraCast) suena en los horarios que pongas aquí. En «Biblioteca y música» (pestaña «Programas y música») eliges qué suena en cada programa.
      </p>
      <section aria-labelledby="ad-parrilla">
        <h3 id="ad-parrilla" className="display-up text-[1.25rem]">
          Parrilla
        </h3>
        <div className="mt-3">
          <SchedulePreview programs={programs} slots={slots} onChanged={reload} />
        </div>
        <div className="mt-5">
          <SlotForm programs={programs} onChanged={reload} />
        </div>
      </section>
      <section aria-labelledby="ad-programas">
        <h3 id="ad-programas" className="display-up text-[1.25rem]">
          Programas ({programs.length})
        </h3>
        <details className="mt-3">
          <summary className="btn btn-accent w-fit cursor-pointer">Nuevo programa</summary>
          <div className="mt-3">
            <ProgramForm onChanged={reload} />
          </div>
        </details>
        <ul className="mt-4 grid gap-3">
          {programs.map((p) => (
            <li key={p.id}>
              <details>
                <summary className="panel flex cursor-pointer flex-wrap items-center gap-3 !p-3">
                  <span className="h-6 w-6 rounded-md" style={{ background: p.color }} aria-hidden="true" />
                  <span className="font-bold">{p.name}</span>
                  <span className="mono muted">
                    {p.slots} horarios{p.djUsername ? ` · DJ ${p.djUsername}` : ""}
                    {p.active ? "" : " · inactivo"}
                  </span>
                </summary>
                <div className="mt-2">
                  <ProgramForm program={p} canDelete={canDelete} onChanged={reload} />
                </div>
              </details>
            </li>
          ))}
          {programs.length === 0 && <li className="text-muted">Todavía no hay programas.</li>}
        </ul>
      </section>
    </div>
  );
}

/**
 * El AutoDJ dentro del estudio: la parrilla de programas con sus horarios (quien gestiona la emisora) y, en «Música y listas», la
 * biblioteca de AzuraCast (carpetas, subir canciones), las listas de reproducción con su horario y la música de cada programa.
 * Es la misma gestión de Radio → Biblioteca y Programación del administrador, sin salir de la consola.
 */
export function AutoDjTools({ canManage, canDelete }: { canManage: boolean; canDelete: boolean }) {
  const [tab, setTab] = useState<"grid" | "music">(canManage ? "grid" : "music");
  return (
    <div className="zs-autodj">
      <div className="zs-tabs" role="tablist" aria-label="AutoDJ">
        {canManage && (
          <button type="button" role="tab" className="zs-tab" aria-selected={tab === "grid"} onClick={() => setTab("grid")}>
            Parrilla y programas
          </button>
        )}
        <button type="button" role="tab" className="zs-tab" aria-selected={tab === "music"} onClick={() => setTab("music")}>
          Biblioteca y música
        </button>
      </div>
      <div className="mt-4" hidden={tab !== "grid"}>
        {canManage && <GridTab canDelete={canDelete} />}
      </div>
      <div className="mt-4" hidden={tab !== "music"}>
        <LibraryManager canEditSchedule={canManage} />
      </div>
    </div>
  );
}
