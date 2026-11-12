import type { Db } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { guarded, reply } from "@/modules/studio/http";
import { getProgramForDj } from "./dj";

/** Programa del DJ que entra al estudio (privado: lleva sesión y no se cachea). */
export function djProgramHandler(db: Db, actor: Actor | null, dj: string | null, now?: Date): Promise<Response> {
  return guarded(actor, async () => {
    if (!dj) return reply(400, "Falta el usuario del DJ.");
    return Response.json(await getProgramForDj(db, actor, dj, now), { headers: { "cache-control": "private, no-store" } });
  });
}
