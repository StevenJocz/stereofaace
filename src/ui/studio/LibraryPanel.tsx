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
      className="studio-row"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([file]));
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDoubleClick={() => onAdd([file])}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{file.title}</span>
        <span className="mono muted block truncate">
          {file.artist || "—"} ·{" "}
          {file.durationSec ? formatTime(file.durationSec) : "--:--"}
        </span>
      </span>
      <button
        type="button"
        className="btn !px-3 !py-1"
        onClick={() => onAdd([file])}
        aria-label={`Añadir ${file.title} a la cola`}
      >
        +
      </button>
    </li>
  );
}

export function LibraryPanel({
  onAdd,
  queue,
}: {
  onAdd: (items: QueueItem[]) => void;
  queue: QueueItem[];
}) {
  const [tab, setTab] = useState<Tab>("folders");
  const [path, setPath] = useState("");
  const [listId, setListId] = useState<number | null>(null);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

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
    <section
      className="studio-library panel"
      aria-label="Biblioteca de AzuraCast"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Biblioteca</h2>
        <div role="tablist" aria-label="Origen" className="flex flex-wrap gap-1.5">
          {(["folders", "playlists", "saved", "history"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              className={
                tab === t ? "btn btn-accent !px-3 !py-1" : "btn !px-3 !py-1"
              }
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
            className="input mt-3 w-full"
            placeholder="Buscar por título o artista"
            aria-label="Buscar en la biblioteca"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
          />

          {!q && tab === "folders" && (
            <nav
              aria-label="Ruta"
              className="mono muted mt-3 flex flex-wrap gap-1"
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
              className="mono muted mt-3 hover:text-accent"
              onClick={() => setListId(null)}
            >
              ← Todas las listas
            </button>
          )}

          {loading && <p className="mono muted mt-4">Cargando…</p>}
          {!loading && status === 409 && (
            <p role="alert" className="mt-4">
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
            <p role="alert" className="mono mt-4 text-[var(--violet)]">
              {error ?? "No se pudo cargar la biblioteca."}
            </p>
          )}

          {!loading && status === 200 && (
            <>
              {files.length > 0 && (
                <button
                  type="button"
                  className="btn mt-3 !px-3 !py-1"
                  onClick={() => add(files)}
                >
                  Añadir todo ({files.length})
                </button>
              )}
              <ul className="studio-scroll mt-3">
                {showLists &&
                  lists.map((l) => (
                    <li key={l.id} className="studio-row">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setListId(l.id)}
                      >
                        <span className="block truncate font-bold">
                          {l.name}
                        </span>
                        <span className="mono muted">
                          {l.trackCount} pistas
                        </span>
                      </button>
                    </li>
                  ))}
                {folders.map((f) => (
                  <li key={f.path} className="studio-row">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        setQInput("");
                        setTab("folders");
                        setPath(f.path);
                      }}
                    >
                      <span aria-hidden="true">▸ </span>
                      <span className="font-bold">{f.name}</span>
                    </button>
                  </li>
                ))}
                {files.map((f) => (
                  <FileRow key={f.id} file={f} onAdd={add} />
                ))}
              </ul>
              {!showLists && folders.length === 0 && files.length === 0 && (
                <p className="studio-empty">No hay pistas aquí.</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
