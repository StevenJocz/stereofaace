"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AzFile, AzFolder } from "@/modules/studio/azuracast";
import type { AutoDjPlaylist, ScheduleRow } from "@/modules/studio/library-admin";

type Listing = { folders: AzFolder[]; files: AzFile[] };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión.");
  }
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(res.status === 401 ? "Tu sesión expiró. Vuelve a iniciar sesión." : (body?.error ?? `El servidor respondió con el error ${res.status}.`));
  return body as T;
}
const post = <T,>(url: string, data: unknown) => call<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });

const mmss = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "—");
const DAY_CHIPS: [number, string][] = [[1, "L"], [2, "M"], [3, "X"], [4, "J"], [5, "V"], [6, "S"], [7, "D"]];
const DAY_NAME = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const parentOf = (p: string) => p.split("/").slice(0, -1).join("/");

function Alert({ text, ok = false }: { text: string | null; ok?: boolean }) {
  if (!text) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`mono ${ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
      {text}
    </p>
  );
}

/** Biblioteca de la radio: archivos y carpetas de AzuraCast, y las listas del AutoDJ con su horario. */
export function LibraryManager() {
  const [tab, setTab] = useState<"files" | "lists">("files");
  return (
    <div>
      <div role="tablist" aria-label="Biblioteca" className="studio-tabs">
        {(
          [
            ["files", "Archivos y carpetas"],
            ["lists", "Listas y programación"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="studio-tab" onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">{tab === "files" ? <FilesTab /> : <ListsTab />}</div>
    </div>
  );
}

/* ───────────────────────── Archivos ───────────────────────── */

type Upload = { id: number; name: string; state: "subiendo" | "listo" | "error"; error?: string };

function FilesTab() {
  const [path, setPath] = useState("");
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [lists, setLists] = useState<AutoDjPlaylist[]>([]);
  const [moveTo, setMoveTo] = useState("");
  const [listId, setListId] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const load = useCallback(async (p: string) => {
    setError(null);
    try {
      setData(await call<Listing>(`/api/studio/library?path=${encodeURIComponent(p)}`));
      setPicked(new Set());
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "No se pudo leer la biblioteca.");
    }
  }, []);

  useEffect(() => {
    void load(path);
  }, [path, load]);
  useEffect(() => {
    call<AutoDjPlaylist[]>("/api/studio/autodj/playlists")
      .then((l) => setLists(l.filter((x) => x.editable)))
      .catch(() => undefined);
  }, []);

  const toggle = (key: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const upload = async (files: FileList | File[]) => {
    setNotice(null);
    for (const file of Array.from(files)) {
      const id = ++seq.current;
      setUploads((u) => [...u, { id, name: file.name, state: "subiendo" }]);
      try {
        const form = new FormData();
        form.set("file", file);
        form.set("dir", path);
        await call("/api/studio/library/upload", { method: "POST", body: form });
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, state: "listo" } : x)));
      } catch (e) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, state: "error", error: e instanceof Error ? e.message : "Falló la subida." } : x)));
      }
    }
    await load(path);
  };

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await work());
      await load(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };

  const split = () => {
    const files: string[] = [];
    const dirs: string[] = [];
    for (const k of picked) (k.startsWith("d:") ? dirs : files).push(k.slice(2));
    return { files, dirs };
  };

  const folders = data?.folders ?? [];
  const files = data?.files ?? [];
  const crumbs = path ? path.split("/") : [];
  const moveOptions = [
    ...(path ? [{ value: "", label: "Raíz de la biblioteca" }, ...(parentOf(path) ? [{ value: parentOf(path), label: `Carpeta de arriba (${parentOf(path)})` }] : [])] : []),
    ...folders.filter((f) => !picked.has(`d:${f.path}`)).map((f) => ({ value: f.path, label: `Dentro de «${f.name}»` })),
  ];

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      <nav aria-label="Carpeta actual" className="mono flex flex-wrap items-center gap-1">
        <button type="button" className="hover:text-accent-ink" onClick={() => setPath("")}>
          Biblioteca
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="muted">/</span>
            <button type="button" className="hover:text-accent-ink" onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}>
              {c}
            </button>
          </span>
        ))}
      </nav>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <input ref={input} type="file" accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a" multiple hidden onChange={(e) => e.target.files && void upload(e.target.files)} />
        <button type="button" className="btn btn-accent" onClick={() => input.current?.click()}>
          Subir canciones
        </button>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const name = newFolder;
            void run(async () => {
              await post("/api/studio/library/folder", { parent: path, name });
              setNewFolder("");
              return `Carpeta «${name}» creada.`;
            });
          }}
        >
          <label className="block">
            <span className="mono muted block">Nueva carpeta</span>
            <input className="input !py-1.5" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} maxLength={100} placeholder="Nombre" />
          </label>
          <button type="submit" className="btn" disabled={busy || !newFolder.trim()}>
            Crear
          </button>
        </form>
        <p className="mono muted text-[0.7rem]">MP3, WAV, OGG, M4A o FLAC · hasta 60 MB por archivo · también puedes arrastrarlos aquí</p>
      </div>

      {uploads.length > 0 && (
        <ul className="mt-4 grid gap-1" aria-label="Subidas">
          {uploads.slice(-8).map((u) => (
            <li key={u.id} className="mono flex flex-wrap gap-2 text-[0.78rem]">
              <span className={u.state === "error" ? "text-[#ff8a8a]" : u.state === "listo" ? "text-accent-ink" : "muted"}>{u.state === "subiendo" ? "⏳" : u.state === "listo" ? "✓" : "✕"}</span>
              <span className="truncate">{u.name}</span>
              {u.error && <span className="text-[#ff8a8a]">{u.error}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-1">
        <Alert text={error} />
        <Alert text={notice} ok />
      </div>

      {picked.size > 0 && (
        <div className="panel mt-4 flex flex-wrap items-end gap-3 p-3" role="group" aria-label="Acciones para lo seleccionado">
          <span className="mono">{picked.size} seleccionados</span>
          <label className="block">
            <span className="mono muted block">Mover</span>
            <select className="input !py-1.5" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Elige destino…</option>
              {moveOptions.map((o) => (
                <option key={`${o.value}|${o.label}`} value={o.value === "" ? "/" : o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy || !moveTo}
            onClick={() =>
              void run(async () => {
                const r = await post<{ affected: number }>("/api/studio/library/batch", { action: "move", ...split(), target: moveTo === "/" ? "" : moveTo });
                return `${r.affected} elementos movidos.`;
              })
            }
          >
            Mover
          </button>
          <label className="block">
            <span className="mono muted block">Agregar a una lista</span>
            <select className="input !py-1.5" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">Elige una lista…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy || !listId}
            onClick={() =>
              void run(async () => {
                await post("/api/studio/library/batch", { action: "playlist", ...split(), playlists: [Number(listId)] });
                return "Agregado a la lista. Si elegiste una carpeta, también lo que subas después a ella.";
              })
            }
          >
            Agregar
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              const { files: f, dirs: d } = split();
              const msg = `Vas a eliminar ${d.length} carpeta(s) con todo su contenido y ${f.length} archivo(s) de AzuraCast. No se puede deshacer. ¿Continuar?`;
              if (window.confirm(msg))
                void run(async () => {
                  const r = await post<{ affected: number }>("/api/studio/library/batch", { action: "delete", files: f, dirs: d });
                  return `${r.affected} elementos eliminados.`;
                });
            }}
          >
            Eliminar
          </button>
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
        {data === null && !error ? (
          <p className="muted" aria-busy="true">
            Cargando biblioteca…
          </p>
        ) : folders.length === 0 && files.length === 0 && data ? (
          <p className="muted">Esta carpeta está vacía. Sube canciones o crea una carpeta para organizarlas.</p>
        ) : (
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr className="mono border-b border-line text-muted">
                <th className="w-8 py-2" aria-label="Seleccionar" />
                <th className="py-2 pr-4 font-normal">Nombre</th>
                <th className="py-2 pr-4 font-normal">Artista</th>
                <th className="py-2 font-normal">Duración</th>
              </tr>
            </thead>
            <tbody>
              {folders.map((f) => (
                <tr key={f.path} className="border-b border-line">
                  <td className="py-2">
                    <input type="checkbox" aria-label={`Seleccionar la carpeta ${f.name}`} checked={picked.has(`d:${f.path}`)} onChange={() => toggle(`d:${f.path}`)} />
                  </td>
                  <td className="py-2 pr-4" colSpan={3}>
                    <button type="button" className="font-bold hover:text-accent-ink" onClick={() => setPath(f.path)}>
                      📁 {f.name}
                    </button>
                  </td>
                </tr>
              ))}
              {files.map((f) => (
                <tr key={f.id} className="border-b border-line">
                  <td className="py-2">
                    <input type="checkbox" aria-label={`Seleccionar ${f.title}`} checked={picked.has(`f:${f.path}`)} onChange={() => toggle(`f:${f.path}`)} />
                  </td>
                  <td className="py-2 pr-4">{f.title}</td>
                  <td className="muted py-2 pr-4">{f.artist || "—"}</td>
                  <td className="mono py-2">{mmss(f.durationSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Listas y programación ───────────────────────── */

const emptyList = (): AutoDjPlaylist => ({ id: 0, name: "", editable: true, enabled: true, order: "shuffle", weight: 3, tracks: 0, schedule: [] });

const summary = (rows: ScheduleRow[]) =>
  rows.length === 0
    ? "Siempre (según su peso)"
    : rows.map((r) => `${r.days.length === 7 ? "Todos los días" : r.days.map((d) => DAY_NAME[d]).join(" · ")} ${r.start}–${r.end}`).join(" | ");

function ListsTab() {
  const [lists, setLists] = useState<AutoDjPlaylist[] | null>(null);
  const [editing, setEditing] = useState<AutoDjPlaylist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setLists(await call<AutoDjPlaylist[]>("/api/studio/autodj/playlists"));
    } catch (e) {
      setLists([]);
      setError(e instanceof Error ? e.message : "No se pudieron leer las listas.");
    }
  }, []);
  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- carga inicial
  }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await post("/api/studio/autodj/playlists", { ...editing, id: editing.id || undefined });
      setNotice("Lista guardada. El AutoDJ aplica el horario en cuanto AzuraCast la recarga.");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (l: AutoDjPlaylist) => {
    if (!window.confirm(`Vas a eliminar la lista «${l.name}». Las canciones NO se borran. ¿Continuar?`)) return;
    setError(null);
    try {
      await call(`/api/studio/autodj/playlists?id=${l.id}`, { method: "DELETE" });
      setNotice(`Lista «${l.name}» eliminada.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  };

  const setRow = (i: number, patch: Partial<ScheduleRow>) =>
    setEditing((cur) => (cur ? { ...cur, schedule: cur.schedule.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : cur));

  return (
    <div>
      <p className="muted max-w-[70ch]">
        Cada lista es un bloque de música del AutoDJ. Sin horario suena siempre según su peso; con horario, solo en esos días y horas. Agrega canciones o carpetas a una lista desde
        «Archivos y carpetas». Las horas son las de la estación (Colombia).
      </p>
      <div className="mt-4 grid gap-1">
        <Alert text={error} />
        <Alert text={notice} ok />
      </div>

      {lists === null ? (
        <p className="muted mt-4" aria-busy="true">
          Cargando listas…
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {lists.map((l) => (
            <li key={l.id} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="display-up text-[1.15rem]">{l.name}</p>
                  <p className="mono muted mt-1 text-[0.72rem]">
                    {l.editable ? `${l.tracks} pistas · peso ${l.weight} · ${l.order === "shuffle" ? "mezcla" : l.order === "random" ? "aleatorio" : "en orden"}` : "Señal externa"} ·{" "}
                    {l.enabled ? "Activa" : "Pausada"}
                  </p>
                  <p className="mono mt-1 text-[0.75rem]">{l.editable ? summary(l.schedule) : "Se gestiona en la pestaña Señal del estudio"}</p>
                </div>
                {l.editable && (
                  <div className="flex gap-2">
                    <button type="button" className="btn !px-4 !py-2" onClick={() => setEditing({ ...l })}>
                      Editar
                    </button>
                    <button type="button" className="btn !px-4 !py-2" onClick={() => void remove(l)}>
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {lists.length === 0 && <li className="muted">Todavía no hay listas.</li>}
        </ul>
      )}

      {!editing && (
        <button type="button" className="btn btn-accent mt-5" onClick={() => setEditing(emptyList())}>
          Nueva lista
        </button>
      )}

      {editing && (
        <form
          className="panel mt-6 grid max-w-3xl gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="display-up text-[1.2rem]">{editing.id ? "Editar lista" : "Nueva lista"}</h2>
          <label className="block">
            <span className="mono muted block">Nombre</span>
            <input className="input" value={editing.name} maxLength={60} required onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
              <span>Activa</span>
            </label>
            <label className="block">
              <span className="mono muted block">Orden</span>
              <select className="input !py-1.5" value={editing.order} onChange={(e) => setEditing({ ...editing, order: e.target.value as AutoDjPlaylist["order"] })}>
                <option value="shuffle">Mezcla</option>
                <option value="random">Aleatorio</option>
                <option value="sequential">En orden</option>
              </select>
            </label>
            <label className="block">
              <span className="mono muted block">Peso (1–25)</span>
              <input className="input !py-1.5 w-24" type="number" min={1} max={25} value={editing.weight} onChange={(e) => setEditing({ ...editing, weight: Number(e.target.value) || 1 })} />
            </label>
          </div>

          <fieldset className="grid gap-3">
            <legend className="mono muted mb-1">Programación (sin horarios = suena siempre)</legend>
            {editing.schedule.map((r, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 rounded-[8px] border border-line p-3">
                <div className="flex gap-1" role="group" aria-label="Días">
                  {DAY_CHIPS.map(([n, label]) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={r.days.includes(n)}
                      className={`chip-day ${r.days.includes(n) ? "is-on" : ""}`}
                      onClick={() => setRow(i, { days: r.days.includes(n) ? r.days.filter((d) => d !== n) : [...r.days, n].sort() })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mono muted block">Desde</span>
                  <input className="input !py-1.5" type="time" value={r.start} onChange={(e) => setRow(i, { start: e.target.value })} required />
                </label>
                <label className="block">
                  <span className="mono muted block">Hasta</span>
                  <input className="input !py-1.5" type="time" value={r.end} onChange={(e) => setRow(i, { end: e.target.value })} required />
                </label>
                <button type="button" className="btn !px-3 !py-1.5" onClick={() => setEditing({ ...editing, schedule: editing.schedule.filter((_, j) => j !== i) })}>
                  Quitar
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn !px-4 !py-2" onClick={() => setEditing({ ...editing, schedule: [...editing.schedule, { days: [1, 2, 3, 4, 5, 6, 7], start: "08:00", end: "12:00" }] })}>
                Agregar horario
              </button>
            </div>
            <p className="mono muted text-[0.7rem]">Sin ningún día marcado, el horario aplica todos los días. Si «Hasta» es menor que «Desde», cruza la medianoche.</p>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className="btn btn-accent" disabled={busy}>
              Guardar lista
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
