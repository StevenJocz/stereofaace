"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AzFile, AzFolder, AzPlaylist } from "@/modules/studio/azuracast";
import { HistoryTab, SavedListsTab } from "./LibraryExtras";
import { formatTime } from "./MeterBar";
import { DRAG_TYPE, azToQueueItem } from "./engine/library";
import type { QueueItem } from "./engine/queue";

type Tab = "folders" | "playlists" | "saved" | "history";
type Result = { key: string; status: number; data: unknown; error?: string };

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

function useApi(url: string): {
  loading: boolean;
  status: number;
  data: unknown;
  error: string | null;
} {
  const [res, setRes] = useState<Result | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(url, { signal: ctrl.signal })
      .then(async (r) => {
        const body: unknown = await r.json().catch(() => null);
        const error =
          !r.ok && body && typeof body === "object" && "error" in body
            ? String((body as { error: unknown }).error)
            : undefined;
        setRes({ key: url, status: r.status, data: body, error });
      })
      .catch(() => {
        if (!ctrl.signal.aborted)
          setRes({
            key: url,
            status: 0,
            data: null,
            error: "No se pudo conectar con la biblioteca.",
          });
      });
    return () => ctrl.abort();
  }, [url]);
  const fresh = res?.key === url ? res : null;
  return {
    loading: !fresh,
    status: fresh?.status ?? 0,
    data: fresh?.data ?? null,
    error: fresh?.error ?? null,
  };
}

function FileRow({
  file,
  onAdd,
}: {
  file: AzFile;
  onAdd: (f: AzFile[]) => void;
}) {
  return (
    <li
      className="zs-row zs-frow"
      data-state="file"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([file]));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={() => onAdd([file])}
      title="Doble clic o arrastra a la lista para añadirla"
    >
      <span className="zs-ico" aria-hidden="true">
        ♪
      </span>
      <span className="zs-fcol zs-ftitle">{file.title}</span>
      <span className="zs-fcol zs-fartist">{file.artist || "—"}</span>
      <span className="zs-row-dur">{file.durationSec ? formatTime(file.durationSec) : "--:--"}</span>
      <button type="button" className="zs-row-add" onClick={() => onAdd([file])} aria-label={`Añadir ${file.title} a la lista`}>
        +
      </button>
    </li>
  );
}

export function LibraryPanel({
  onAdd,
  queue,
  searchSeed = null,
}: {
  onAdd: (items: QueueItem[]) => void;
  queue: QueueItem[];
  /** Texto que el estudio manda a la búsqueda (p. ej. un pedido de la audiencia); `n` cambia con cada envío. */
  searchSeed?: { text: string; n: number } | null;
}) {
  const [tab, setTab] = useState<Tab>("folders");
  const [path, setPath] = useState("");
  const [listId, setListId] = useState<number | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!searchSeed) return;
    setTab("folders"); // eslint-disable-line react-hooks/set-state-in-effect -- un pedido del estudio abre la búsqueda
    setListId(null);
    setPath("");
    setQInput(searchSeed.text);
  }, [searchSeed]);

  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const extra = tab === "saved" || tab === "history";
  let url: string;
  if (extra) url = "/api/studio/library?path=";
  else if (q) url = `/api/studio/library?q=${encodeURIComponent(q)}`;
  else if (tab === "folders")
    url = `/api/studio/library?path=${encodeURIComponent(path)}`;
  else if (listId === null) url = "/api/studio/playlists";
  else url = `/api/studio/playlists?id=${listId}`;

  const { loading: loadingRaw, status: statusRaw, data, error } = useApi(url);
  const loading = extra ? false : loadingRaw;
  const status = extra ? 0 : statusRaw;

  let folders: AzFolder[] = [];
  let files: AzFile[] = [];
  let lists: AzPlaylist[] = [];
  if (!loading && status === 200 && data) {
    if (q || tab === "folders") {
      const d = data as { folders?: unknown; files?: unknown };
      folders = isArr(d.folders) ? (d.folders as AzFolder[]) : [];
      files = isArr(d.files) ? (d.files as AzFile[]) : [];
    } else if (listId === null) {
      lists = isArr(data) ? (data as AzPlaylist[]) : [];
    } else {
      files = isArr(data) ? (data as AzFile[]) : [];
    }
  }

  const add = (fs: AzFile[]) => onAdd(fs.map(azToQueueItem));
  const crumbs = path ? path.split("/") : [];
  const showLists = !q && tab === "playlists" && listId === null;

  return (
    <div className="zs-explorer" aria-label="Biblioteca de AzuraCast">
      <header className="zs-explorer-head">
        <div role="tablist" aria-label="Origen" className="zs-tabs">
          {(["folders", "playlists", "saved", "history"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              className="zs-tab"
              onClick={() => {
                setTab(t);
                setListId(null);
                setPath("");
                setQInput("");
              }}
            >
              {t === "folders"
                ? "Carpetas"
                : t === "playlists"
                  ? "Listas"
                  : t === "saved"
                    ? "Guardadas"
                    : "Historial"}
            </button>
          ))}
        </div>
      </header>
      {tab === "saved" && <SavedListsTab queue={queue} onAdd={onAdd} />}
      {tab === "history" && <HistoryTab />}
      {!extra && (
        <>
          <input
            type="search"
            className="zs-search"
            placeholder="Buscar por título o artista"
            aria-label="Buscar en la biblioteca"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />

          {!q && tab === "folders" && (
            <nav
              aria-label="Ruta"
              className="zs-crumbs"
            >
              <button
                type="button"
                className="hover:text-accent"
                onClick={() => setPath("")}
              >
                Biblioteca
              </button>
              {crumbs.map((c, i) => (
                <span key={i} className="flex gap-1">
                  /
                  <button
                    type="button"
                    className="hover:text-accent"
                    onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
                  >
                    {c}
                  </button>
                </span>
              ))}
            </nav>
          )}
          {!q && tab === "playlists" && listId !== null && (
            <button
              type="button"
              className="zs-crumbs"
              onClick={() => setListId(null)}
            >
              ← Todas las listas
            </button>
          )}

          {loading && <p className="zs-empty">Cargando…</p>}
          {!loading && status === 409 && (
            <p role="alert" className="zs-empty">
              {error}{" "}
              <Link
                href="/admin/radio/studio/ajustes"
                className="text-accent-ink underline"
              >
                Abrir ajustes del estudio
              </Link>
            </p>
          )}
          {!loading && status !== 200 && status !== 409 && (
            <p role="alert" className="zs-empty">
              {error ?? "No se pudo cargar la biblioteca."}
            </p>
          )}

          {!loading && status === 200 && (
            <>
              {files.length > 0 && (
                <div className="zs-listhead zs-fhead" aria-hidden="true">
                  <span>Título</span>
                  <span>Intérprete</span>
                  <span>Duración</span>
                </div>
              )}
              <ul className="zs-list zs-flist">
                {showLists &&
                  lists.map((l) => (
                    <li key={l.id} className="zs-row" data-state="folder">
                      <button type="button" className="zs-folder" onClick={() => setListId(l.id)}>
                        <span aria-hidden="true">▤</span>
                        <span className="zs-row-text">{l.name}</span>
                        <span className="zs-row-dur">{l.trackCount} pistas</span>
                      </button>
                    </li>
                  ))}
                {folders.map((f) => (
                  <li key={f.path} className="zs-row" data-state="folder">
                    <button
                      type="button"
                      className="zs-folder"
                      onClick={() => {
                        setQInput("");
                        setTab("folders");
                        setPath(f.path);
                      }}
                    >
                      <span aria-hidden="true">▸</span>
                      <span className="zs-row-text">{f.name}</span>
                    </button>
                  </li>
                ))}
                {files.map((f) => (
                  <FileRow key={f.id} file={f} onAdd={add} />
                ))}
              </ul>
              {!showLists && folders.length === 0 && files.length === 0 && (
                <p className="zs-empty">No hay pistas aquí.</p>
              )}
              <p className="zs-foot">
                {files.length} {files.length === 1 ? "audio" : "audios"}
                {files.length > 0 && (
                  <button type="button" className="zs-linkbtn" onClick={() => add(files)}>
                    Añadir todo
                  </button>
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
