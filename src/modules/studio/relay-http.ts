import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";
import { guarded } from "./http";
import { loadRelayUrl } from "./relay";

/** Pasa el audio de la señal externa por el servidor (misma origen: el navegador lo puede mezclar sin CORS). */
export function relayStreamHandler(db: Db, actor: Actor | null, request: Request, fetchImpl: typeof fetch = fetch): Promise<Response> {
  return guarded(actor, async () => {
    const url = await loadRelayUrl(db, actor);
    if (!url) throw new DomainError("relay_not_configured", "La señal externa no está configurada.");
    let up: Response;
    try {
      up = await fetchImpl(url, { headers: { "user-agent": "StereoFace-Relay/1.0", accept: "audio/*" }, redirect: "follow", signal: request.signal });
    } catch {
      throw new DomainError("relay_upstream", "No se pudo conectar con la señal externa.");
    }
    const type = up.headers.get("content-type") ?? "";
    if (!up.ok || !up.body || !/^(audio\/|application\/ogg)/i.test(type)) {
      await up.body?.cancel().catch(() => undefined);
      throw new DomainError("relay_upstream", "La señal externa no respondió con audio.");
    }
    return new Response(up.body, { status: 200, headers: { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  });
}
