import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { sameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { beginYouTubeConnect, defaultDeps, finishYouTubeConnect, getVideoAdmin, pollVideo, issuePublishToken, prepareBroadcast, publicVideo, stopBroadcast, type VideoDeps } from "./service";

const NO_STORE = { "cache-control": "no-store" } as const;
const reply = (status: number, error: string) => Response.json({ error }, { status, headers: NO_STORE });

const STATUS_BY_CODE: Record<string, number> = {
  video_out_of_schedule: 403,
  video_super_only: 403,
  video_not_yours: 403,
  video_ticket: 403,
  video_busy: 409,
  video_state: 409,
  media_unavailable: 502,
  video_not_configured: 503,
  youtube_not_connected: 503,
  youtube_auth: 502,
  youtube_error: 502,
  youtube_forbidden: 502,
  youtube_network: 502,
  youtube_quota: 502,
  youtube_not_enabled: 502,
};

export { sameOrigin };

/** Traduce la sesión y los errores esperables a respuestas HTTP. Nunca devuelve secretos ni detalles internos. */
async function guarded(actor: Actor | null, work: () => Promise<Response>): Promise<Response> {
  if (!actor) return reply(401, "Tu sesión expiró. Vuelve a iniciar sesión.");
  try {
    return await work();
  } catch (error) {
    if (error instanceof ForbiddenError) return reply(403, "No tienes permiso para usar la cámara en cabina.");
    if (error instanceof DomainError) return reply(STATUS_BY_CODE[error.code] ?? 400, error.message);
    console.error("[video]", error instanceof Error ? error.name : "error");
    return reply(500, "No se pudo completar la petición.");
  }
}

const mutating = (request: Request) => (sameOrigin(request) ? null : reply(403, "Origen no permitido."));

export function videoStatusHandler(db: Db, actor: Actor | null, deps?: VideoDeps): Promise<Response> {
  return guarded(actor, async () => Response.json(await pollVideo(db, actor, deps), { headers: NO_STORE }));
}

export function videoStartHandler(db: Db, actor: Actor | null, request: Request, deps?: VideoDeps): Promise<Response> {
  return guarded(actor, async () => {
    const blocked = mutating(request);
    if (blocked) return blocked;
    if (!rateLimit(`video:start:${actor!.id}`, 6, 60_000).ok) return reply(429, "Demasiados intentos. Espera un minuto.");
    return Response.json(await prepareBroadcast(db, actor, deps ?? (await defaultDeps(db))), { headers: NO_STORE });
  });
}

/** Canjea la credencial de un solo uso (`Authorization: Bearer`) por un token de LiveKit para publicar la cámara. */
export function videoTokenHandler(db: Db, actor: Actor | null, request: Request, deps?: VideoDeps): Promise<Response> {
  return guarded(actor, async () => {
    const blocked = mutating(request);
    if (blocked) return blocked;
    if (!rateLimit(`video:token:${actor!.id}`, 10, 60_000).ok) return reply(429, "Demasiados intentos. Espera un minuto.");
    const ticket = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!ticket) return reply(401, "Falta la credencial de transmisión.");
    return Response.json(await issuePublishToken(db, actor, ticket, deps ?? (await defaultDeps(db))), { headers: NO_STORE });
  });
}

export function videoStopHandler(db: Db, actor: Actor | null, request: Request, deps?: VideoDeps): Promise<Response> {
  return guarded(actor, async () => {
    const blocked = mutating(request);
    if (blocked) return blocked;
    await stopBroadcast(db, actor, deps ?? (await defaultDeps(db)));
    return Response.json(await getVideoAdmin(db, actor), { headers: NO_STORE });
  });
}

/** Público: solo «¿hay directo?» y el identificador del video a incrustar. Cacheable unos segundos. */
export async function publicVideoHandler(db: Db, deps?: VideoDeps): Promise<Response> {
  try {
    return Response.json(await publicVideo(db, deps), { headers: { "cache-control": "public, s-maxage=3, stale-while-revalidate=10" } });
  } catch {
    return Response.json({ live: false }, { headers: NO_STORE });
  }
}

/* ───────────── conexión con YouTube (solo superadministrador) ───────────── */

const back = (siteUrl: string, q: string) => new Response(null, { status: 303, headers: { location: `${siteUrl.replace(/\/$/, "")}/admin/ajustes/youtube${q}`, ...NO_STORE } });

export async function youtubeConnectStartHandler(db: Db, actor: Actor | null, siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"): Promise<Response> {
  if (!actor) return new Response(null, { status: 303, headers: { location: `${siteUrl.replace(/\/$/, "")}/admin/login`, ...NO_STORE } });
  try {
    return new Response(null, { status: 303, headers: { location: await beginYouTubeConnect(db, actor), ...NO_STORE } });
  } catch (e) {
    return back(siteUrl, `?error=${encodeURIComponent(e instanceof DomainError ? e.message : "No se pudo iniciar la conexión.")}`);
  }
}

export async function youtubeConnectCallbackHandler(
  db: Db,
  actor: Actor | null,
  url: URL,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  fetchImpl?: typeof fetch,
): Promise<Response> {
  if (!actor) return new Response(null, { status: 303, headers: { location: `${siteUrl.replace(/\/$/, "")}/admin/login`, ...NO_STORE } });
  if (url.searchParams.get("error")) return back(siteUrl, `?error=${encodeURIComponent("Google no autorizó la conexión.")}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back(siteUrl, `?error=${encodeURIComponent("Falta el código de autorización.")}`);
  try {
    await finishYouTubeConnect(db, actor, code, state, fetchImpl);
    return back(siteUrl, "?conectado=1");
  } catch (e) {
    return back(siteUrl, `?error=${encodeURIComponent(e instanceof DomainError ? e.message : "No se pudo completar la conexión.")}`);
  }
}
