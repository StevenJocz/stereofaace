import type { Db } from "@/lib/db";
import { csvCell } from "@/lib/csv";
import type { Actor } from "@/lib/rbac";
import { DomainError } from "@/lib/errors";
import { guarded, reply } from "./http";
import { loadAzuraClient } from "./settings";
import { listHistory, logPlayed, type HistoryEntry } from "./history";
import { deleteSaved, getSaved, listSaved, saveList, type SaveListInput } from "./playlists";

// ── Listas guardadas ──

export const savedListHandler = (db: Db, actor: Actor | null) => guarded(actor, async () => Response.json(await listSaved(db, actor)));

/** Con `check`, comprueba en AzuraCast qué pistas siguen existiendo y devuelve aparte las perdidas (`missing`; null si no se pudo comprobar). */
export const savedGetHandler = (db: Db, actor: Actor | null, id: string, opts: { check?: boolean; fetchImpl?: typeof fetch } = {}) =>
  guarded(actor, async () => {
    const list = await getSaved(db, actor, id);
    if (!opts.check) return Response.json(list);
    try {
      const present = await (await loadAzuraClient(db, actor, opts.fetchImpl)).allFileIds();
      const items = list.items.filter((i) => present.has(i.azId));
      return Response.json({ ...list, items, missing: list.items.filter((i) => !present.has(i.azId)) });
    } catch (error) {
      if (error instanceof DomainError) return Response.json({ ...list, missing: null }); // sin clave o AzuraCast caído: se devuelve todo
      throw error;
    }
  });

export const savedSaveHandler = (db: Db, actor: Actor | null, body: unknown) =>
  guarded(actor, async () => {
    if (typeof body !== "object" || body === null) return reply(400, "Cuerpo no válido.");
    return Response.json(await saveList(db, actor, body as SaveListInput), { status: 201 });
  });

export const savedDeleteHandler = (db: Db, actor: Actor | null, id: string) =>
  guarded(actor, async () => {
    await deleteSaved(db, actor, id);
    return Response.json({ ok: true });
  });

// ── Historial ──

export const historyLogHandler = (db: Db, actor: Actor | null, body: unknown) =>
  guarded(actor, async () => {
    if (typeof body !== "object" || body === null) return reply(400, "Cuerpo no válido.");
    await logPlayed(db, actor, body as HistoryEntry);
    return Response.json({ ok: true }, { status: 201 });
  });

export const historyListHandler = (db: Db, actor: Actor | null, q: { limit: string | null; before: string | null }) =>
  guarded(actor, async () => {
    const limit = q.limit && /^\d{1,4}$/.test(q.limit) ? Number(q.limit) : undefined;
    let before: Date | undefined;
    if (q.before) {
      before = new Date(q.before);
      if (Number.isNaN(before.getTime())) return reply(400, "Fecha no válida.");
    }
    return Response.json(await listHistory(db, actor, { limit, before }));
  });

export const historyCsvHandler = (db: Db, actor: Actor | null) =>
  guarded(actor, async () => {
    const rows = await listHistory(db, actor, { limit: 200 });
    const lines = ["fecha,titulo,artista,origen,dj", ...rows.map((r) => [r.playedAt, r.title, r.artist, r.source, r.djName ?? ""].map(csvCell).join(","))];
    return new Response(lines.join("\n") + "\n", {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="historial-estudio.csv"', "cache-control": "private, no-store" },
    });
  });
