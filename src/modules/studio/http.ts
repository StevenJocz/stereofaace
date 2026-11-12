import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { loadAzuraClient } from "./settings";

const reply = (status: number, error: string) => Response.json({ error }, { status });

/** Traduce la sesión y los errores esperables a respuestas HTTP; la clave de AzuraCast nunca sale de aquí. */
async function guarded(actor: Actor | null, work: () => Promise<Response>): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para usar el estudio.");
  try {
    return await work();
  } catch (error) {
    if (error instanceof ForbiddenError) return reply(403, "No tienes permiso para usar el estudio.");
    if (error instanceof DomainError) {
      if (error.code === "studio_no_key") return reply(409, error.message);
      if (error.code === "azuracast_bad_id") return reply(400, error.message);
      return reply(502, error.message);
    }
    console.error("[studio]", error);
    return reply(500, "No se pudo completar la petición.");
  }
}

const safePath = (p: string) => p.length <= 500 && !p.split("/").includes("..") && !p.includes("\0");

export function libraryHandler(
  db: Db,
  actor: Actor | null,
  params: { path: string | null; q: string | null },
  fetchImpl?: typeof fetch,
): Promise<Response> {
  return guarded(actor, async () => {
    const client = await loadAzuraClient(db, actor, fetchImpl);
    if (params.q && params.q.trim()) {
      return Response.json({ folders: [], files: await client.searchFiles(params.q.trim().slice(0, 100)) });
    }
    const path = params.path ?? "";
    if (!safePath(path)) return reply(400, "Ruta de carpeta no válida.");
    return Response.json(await client.listFolders(path));
  });
}

export function playlistsHandler(db: Db, actor: Actor | null, id: string | null, fetchImpl?: typeof fetch): Promise<Response> {
  return guarded(actor, async () => {
    const client = await loadAzuraClient(db, actor, fetchImpl);
    if (id === null) return Response.json(await client.listPlaylists());
    if (!/^\d{1,9}$/.test(id)) return reply(400, "Identificador de lista no válido.");
    return Response.json(await client.playlistFiles(Number(id)));
  });
}

const PASS = ["content-type", "content-length", "content-range", "accept-ranges"] as const;

export function fileHandler(
  db: Db,
  actor: Actor | null,
  id: string,
  range: string | null,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  return guarded(actor, async () => {
    if (!/^\d{1,9}$/.test(id)) return reply(400, "Identificador de pista no válido.");
    const client = await loadAzuraClient(db, actor, fetchImpl);
    const up = await client.fileStream(id, range);
    const headers = new Headers({ "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
    for (const h of PASS) {
      const v = up.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(up.body, { status: up.status, headers });
  });
}
