"use client";

import { useEffect, useState } from "react";
import { azToQueueItem } from "./engine/library";
import type { QueueItem } from "./engine/queue";
import type { SavedItem } from "@/modules/studio/playlists";
import type { HistoryRow } from "@/modules/studio/history";

type Saved = { id: string; name: string; count: number; mine: boolean };

/** Listas guardadas por el DJ: guardar la cola actual, cargar una a la cola (avisando de pistas perdidas) y borrar. */
export function SavedListsTab({ queue, onAdd }: { queue: QueueItem[]; onAdd: (items: QueueItem[]) => void }) {
  const [lists, setLists] = useState<Saved[] | null>(null);
  const [version, setVersion] = useState(0);
  const [name, setName] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/studio/saved-playlists")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Saved[]) => alive && setLists(d))
      .catch(() => alive && setLists([]));
    return () => {
      alive = false;
    };
  }, [version]);

  const fromLibrary = queue.filter((q) => q.source === "azuracast" && q.url);

  async function save() {
    const items: SavedItem[] = fromLibrary.map((q) => ({
      azId: q.url?.split("/").pop() ?? "",
      title: q.title,
      artist: q.artist,
      durationSec: q.durationSec,
    }));
    const res = await fetch("/api/studio/saved-playlists", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, items }),
    });
    const body = (await res.json().catch(() => null)) as { error?: string; skipped?: number } | null;
    if (!res.ok) return setNote({ ok: false, text: body?.error ?? "No se pudo guardar la lista." });
    const omitted = queue.length - fromLibrary.length + (body?.skipped ?? 0);
    setNote({
      ok: true,
      text: `Lista guardada (${items.length} pistas)${omitted ? `. ${omitted} se omitieron: solo se guardan pistas de la biblioteca.` : "."}`,
    });
    setName("");
    setVersion((v) => v + 1);
  }

  async function load(id: string) {
    const res = await fetch(`/api/studio/saved-playlists?id=${id}&check=1`);
    const body = (await res.json().catch(() => null)) as { error?: string; items?: SavedItem[]; missing?: SavedItem[] | null } | null;
    if (!res.ok || !body?.items) return setNote({ ok: false, text: body?.error ?? "No se pudo cargar la lista." });
    onAdd(body.items.map((i) => azToQueueItem({ id: i.azId, path: "", title: i.title, artist: i.artist, durationSec: i.durationSec })));
    const lost = body.missing?.length ?? 0;
    setNote({
      ok: lost === 0,
      text: lost
        ? `Se cargaron ${body.items.length} pistas. ${lost} ya no existen en AzuraCast: ${(body.missing ?? []).map((m) => m.title).join(", ")}.`
        : `Se cargaron ${body.items.length} pistas.`,
    });
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`¿Borrar la lista «${label}»?`)) return;
    const res = await fetch(`/api/studio/saved-playlists?id=${id}`, { method: "DELETE" });
    if (!res.ok) return setNote({ ok: false, text: "No se pudo borrar la lista." });
    setVersion((v) => v + 1);
  }

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Nombre de la lista" aria-label="Nombre de la lista" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <button
          type="button"
          className="btn btn-accent !px-3"
          disabled={!name.trim() || fromLibrary.length === 0}
          onClick={() => void save()}
          title={fromLibrary.length === 0 ? "La cola no tiene pistas de la biblioteca" : undefined}
        >
          Guardar cola
        </button>
      </div>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`mono mt-2 ${note.ok ? "text-accent-ink" : "text-[var(--violet)]"}`}>
          {note.text}
        </p>
      )}
      {lists === null && <p className="mono muted mt-3">Cargando…</p>}
      {lists?.length === 0 && <p className="studio-empty">Aún no guardaste listas.</p>}
      <ul className="studio-scroll mt-3">
        {lists?.map((l) => (
          <li key={l.id} className="studio-row">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{l.name}</span>
              <span className="mono muted">
                {l.count} pistas{l.mine ? "" : " · de otro DJ"}
              </span>
            </span>
            <button type="button" className="btn !px-3 !py-1" onClick={() => void load(l.id)} aria-label={`Cargar la lista ${l.name} a la cola`}>
              Cargar
            </button>
            <button type="button" className="btn !px-3 !py-1" onClick={() => void remove(l.id, l.name)} aria-label={`Borrar la lista ${l.name}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SOURCE_LABEL: Record<string, string> = { local: "PC", azuracast: "Biblioteca", cart: "Cart" };

/** Últimas pistas y audios que salieron al aire, con exportación a CSV. */
export function HistoryTab() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/studio/history?limit=60")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: HistoryRow[]) => alive && setRows(d))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [version]);

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2">
        <button type="button" className="btn !px-3 !py-1" onClick={() => setVersion((v) => v + 1)}>
          Actualizar
        </button>
        <a className="btn !px-3 !py-1" href="/api/studio/history?format=csv">
          Exportar CSV
        </a>
      </div>
      {rows === null && <p className="mono muted mt-3">Cargando…</p>}
      {rows?.length === 0 && <p className="studio-empty">Todavía no hay emisiones registradas.</p>}
      <ul className="studio-scroll mt-3">
        {rows?.map((r) => (
          <li key={r.id} className="studio-row">
            <span className="mono muted w-12 shrink-0">
              {new Date(r.playedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{r.title}</span>
              <span className="mono muted block truncate">
                {r.artist || "—"} · {SOURCE_LABEL[r.source] ?? r.source}
                {r.djName ? ` · ${r.djName}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
