import { ZodError } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { loadAzuraClient } from "./settings";

export const reply = (status: number, error: string) => Response.json({ error }, { status });

/** Traduce la sesión y los errores esperables a respuestas HTTP; la clave de AzuraCast nunca sale de aquí. */
export async function guarded(actor: Actor | null, work: () => Promise<Response>): Promise<Response> {
  if (!actor) return reply(401, "Inicia sesión para usar el estudio.");
  try {
    return await work();
  } catch (error) {
    if (error instanceof ForbiddenError) return reply(403, "No tienes permiso para usar el estudio.");
    if (error instanceof ZodError) return reply(400, error.issues[0]?.message ?? "Datos no válidos.");
    if (error instanceof DomainError) {
      if (error.code === "studio_no_key" || error.code === "cart_hotkey_taken") return reply(409, error.message);
      if (error.code === "cart_not_found" || error.code === "playlist_not_found") return reply(404, error.message);
      if (error.code === "azuracast_bad_id" || error.code === "cart_bad_audio") return reply(400, error.message);
      if (error.code.startsWith("azuracast")) return reply(502, error.message);
      return reply(400, error.message);
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

export function artHandler(db: Db, actor: Actor | null, id: string, fetchImpl?: typeof fetch): Promise<Response> {
  return guarded(actor, async () => {
    if (!/^\d{1,9}$/.test(id)) return reply(400, "Identificador de pista no válido.");
    const client = await loadAzuraClient(db, actor, fetchImpl);
    const up = await client.art(id);
    const type = up.headers.get("content-type") ?? "";
    if (!/^image\/(jpeg|png|webp|gif)/.test(type)) return reply(404, "Sin carátula.");
    return new Response(up.body, {
      status: 200,
      headers: { "content-type": type, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
    });
  });
}
