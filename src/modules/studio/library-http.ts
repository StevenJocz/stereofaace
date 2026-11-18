import type { Db } from "@/lib/db";
import { sameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/rbac";
import { DomainError } from "@/lib/errors";
import { MAX_SONG_BYTES } from "./audio-validation";
import { bodyGate, guarded, reply } from "./http";
import { linkProgramPlaylist, listProgramMusic, unlinkProgramPlaylist } from "./program-playlists";
import { createFolder, deleteAutoDjPlaylist, libraryBatch, listAutoDjPlaylists, saveAutoDjPlaylist, uploadSong } from "./library-admin";

const JSON_MAX = 100_000;

/** Primero origen y permisos (sin leer el cuerpo), luego lectura del JSON. */
async function jsonBody(actor: Actor | null, request: Request, maxBytes = JSON_MAX): Promise<{ body: unknown } | Response> {
  if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
  const gate = bodyGate(actor, request, maxBytes);
  if (gate) return gate;
  try {
    return { body: await request.json() };
  } catch {
    return reply(400, "Cuerpo no válido.");
  }
}
const isResponse = (x: unknown): x is Response => x instanceof Response;
const asObject = (b: unknown): Record<string, unknown> => (typeof b === "object" && b !== null ? (b as Record<string, unknown>) : {});

export function folderHandler(db: Db, actor: Actor | null, request: Request, fetchImpl?: typeof fetch) {
  return guarded(actor, async () => {
    const r = await jsonBody(actor, request);
    if (isResponse(r)) return r;
    const b = asObject(r.body);
    return Response.json(await createFolder(db, actor, b.parent, b.name, fetchImpl), { status: 201 });
  });
}

export function batchHandler(db: Db, actor: Actor | null, request: Request, fetchImpl?: typeof fetch) {
  return guarded(actor, async () => {
    const r = await jsonBody(actor, request);
    if (isResponse(r)) return r;
    return Response.json(await libraryBatch(db, actor, r.body, fetchImpl));
  });
}

/** Subida de una canción (multipart). El tamaño declarado se comprueba antes de leer el cuerpo. */
export function uploadHandler(db: Db, actor: Actor | null, request: Request, fetchImpl?: typeof fetch) {
  return guarded(actor, async () => {
    if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
    const gate = bodyGate(actor, request, MAX_SONG_BYTES + 1_000_000);
    if (gate) return gate;
    if (!rateLimit(`library:upload:${actor!.id}`, 40, 60_000).ok) return reply(429, "Demasiadas subidas seguidas. Espera un minuto.");
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return reply(400, "Cuerpo no válido.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("library_audio", "Elige un archivo de audio.");
    return Response.json(await uploadSong(db, actor, form.get("dir"), file, fetchImpl), { status: 201 });
  });
}

export const autodjListHandler = (db: Db, actor: Actor | null, fetchImpl?: typeof fetch) =>
  guarded(actor, async () => Response.json(await listAutoDjPlaylists(db, actor, fetchImpl), { headers: { "cache-control": "no-store" } }));

export function autodjSaveHandler(db: Db, actor: Actor | null, request: Request, fetchImpl?: typeof fetch) {
  return guarded(actor, async () => {
    const r = await jsonBody(actor, request);
    if (isResponse(r)) return r;
    return Response.json(await saveAutoDjPlaylist(db, actor, asObject(r.body), fetchImpl));
  });
}

export function autodjDeleteHandler(db: Db, actor: Actor | null, request: Request, fetchImpl?: typeof fetch) {
  return guarded(actor, async () => {
    if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^\d{1,9}$/.test(id)) return reply(400, "Identificador de lista no válido.");
    return Response.json(await deleteAutoDjPlaylist(db, actor, Number(id), fetchImpl));
  });
}

/* ───────────── Música de cada programa ───────────── */

export const programMusicListHandler = (db: Db, actor: Actor | null, fetchImpl?: typeof fetch) =>
  guarded(actor, async () => Response.json(await listProgramMusic(db, actor, fetchImpl), { headers: { "cache-control": "no-store" } }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function programMusicLinkHandler(db: Db, actor: Actor | null, request: Request, fetchImpl?: typeof fetch) {
  return guarded(actor, async () => {
    const r = await jsonBody(actor, request);
    if (isResponse(r)) return r;
    const b = asObject(r.body);
    const playlist = b.playlistId === "new" ? "new" : Number(b.playlistId);
    if (typeof b.programId !== "string" || !UUID.test(b.programId)) return reply(400, "Programa no válido.");
    if (playlist !== "new" && (!Number.isInteger(playlist) || playlist <= 0)) return reply(400, "Lista no válida.");
    const res = await linkProgramPlaylist(db, actor, b.programId, playlist as number | "new", fetchImpl);
    return Response.json(res, { status: 201 });
  });
}

export function programMusicUnlinkHandler(db: Db, actor: Actor | null, request: Request) {
  return guarded(actor, async () => {
    if (!sameOrigin(request)) return reply(403, "Origen no permitido.");
    const id = new URL(request.url).searchParams.get("programId");
    if (!id || !UUID.test(id)) return reply(400, "Programa no válido.");
    await unlinkProgramPlaylist(db, actor, id);
    return Response.json({ ok: true });
  });
}
