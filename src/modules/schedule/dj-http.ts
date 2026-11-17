import type { Db } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { guarded, reply } from "@/modules/studio/http";
import { djUsernameOf, getDjCredentials } from "@/modules/studio/dj-accounts";
import { getProgramForDj } from "./dj";

/**
 * Programa del DJ que entra al estudio (privado: lleva sesión y no se cachea).
 * Un locutor solo ve lo suyo: el usuario sale de su sesión, no de la petición, y no se le ofrecen otros programas.
 */
export function djProgramHandler(db: Db, actor: Actor | null, dj: string | null, now?: Date): Promise<Response> {
  return guarded(actor, async () => {
    const headers = { "cache-control": "private, no-store" };
    if (actor?.role === "locutor") {
      const own = await djUsernameOf(db, actor);
      if (!own) return reply(403, "Tu cuenta no está habilitada para emitir.");
      const info = await getProgramForDj(db, actor, own, now);
      return Response.json({ ...info, others: [] }, { headers });
    }
    if (!dj) return reply(400, "Falta el usuario del DJ.");
    return Response.json(await getProgramForDj(db, actor, dj, now), { headers });
  });
}

/** Credenciales de emisión del locutor: solo dentro de su horario. Quien no es locutor no recibe nada. */
export function djCredentialsHandler(db: Db, actor: Actor | null, now?: Date): Promise<Response> {
  return guarded(actor, async () =>
    Response.json(await getDjCredentials(db, actor, now), { headers: { "cache-control": "private, no-store" } }),
  );
}
