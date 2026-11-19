import { ZodError } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { sameOrigin } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/rbac";
import { guarded, reply } from "@/modules/studio/http";
import type { SessionUser } from "@/modules/users/auth";
import { listUserGifs, removeUserGif, uploadUserGif } from "./user-gifs";
import {
  createRequest,
  chatIdentity,
  chatWindow,
  deleteMessage,
  getChatConfig,
  listMessages,
  listMessagesAdmin,
  listRequestsAdmin,
  listRequestsPublic,
  muteClient,
  postMessage,
  saveChatConfig,
  setRequestStatus,
  type RequestStatus,
} from "./service";

const NO_STORE = { "cache-control": "no-store" };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: NO_STORE });

function tooFast(retryAfterMs: number, message: string): Response {
  return Response.json({ error: message }, { status: 429, headers: { ...NO_STORE, "retry-after": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } });
}

/** Errores esperables del chat público → respuestas claras; lo inesperado se registra y no se detalla. */
async function publicGuard(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? "Datos no válidos." }, 400);
    if (error instanceof DomainError) return json({ error: error.message, code: error.code }, error.code === "chat_off" || error.code === "chat_muted" || error.code === "requests_off" ? 403 : 400);
    console.error("[chat]", error);
    return json({ error: "No se pudo completar la petición." }, 500);
  }
}

const asObj = (b: unknown): Record<string, unknown> | null => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" ? v : "");

const AUTH_REQUIRED = { error: "Regístrate gratis o entra a tu cuenta para participar.", code: "auth_required" };
const authRequired = () => json(AUTH_REQUIRED, 401);

/** Lo que el panel necesita saber de quien mira: si tiene cuenta y con qué apodo escribiría. */
async function viewerOf(db: Db, user: SessionUser | null): Promise<{ signedIn: boolean; nickname: string | null; clientId: string | null }> {
  if (!user) return { signedIn: false, nickname: null, clientId: null };
  try {
    const id = await chatIdentity(db, user);
    return { signedIn: true, nickname: id.nickname, clientId: id.clientId };
  } catch {
    return { signedIn: true, nickname: null, clientId: null }; // cuenta suspendida del chat
  }
}

const cursor = (v: string | null) => (v !== null && /^\d{1,15}$/.test(v) ? Number(v) : undefined);

/* ───────────── Público ───────────── */

export function publicChatGet(db: Db, q: { after: string | null; user: SessionUser | null }): Promise<Response> {
  return publicGuard(async () => {
    const viewer = await viewerOf(db, q.user);
    const [config, list] = await Promise.all([getChatConfig(db), listMessages(db, { after: cursor(q.after), clientId: viewer.clientId ?? undefined })]);
    const w = chatWindow();
    return json({ config, ...list, viewer: { signedIn: viewer.signedIn, nickname: viewer.nickname }, reset: { startsAt: w.startsAt.toISOString(), resetsAt: w.resetsAt.toISOString() } });
  });
}

export function publicChatPost(db: Db, body: unknown, ip: string, user: SessionUser | null): Promise<Response> {
  return publicGuard(async () => {
    if (!user) return authRequired();
    const b = asObj(body);
    if (!b) return json({ error: "Petición no válida." }, 400);
    const id = await chatIdentity(db, user);
    const byClient = rateLimit(`chat:c:${id.clientId}`, 1, 2000);
    if (!byClient.ok) return tooFast(byClient.retryAfterMs, "Vas muy rápido: espera un par de segundos.");
    const byIp = rateLimit(`chat:ip:${ip}`, 15, 30_000);
    if (!byIp.ok) return tooFast(byIp.retryAfterMs, "Demasiados mensajes desde tu conexión. Espera un momento.");
    const m = await postMessage(db, { clientId: id.clientId, nickname: id.nickname, verified: id.verified, userId: user.id, text: str(b.text) || undefined, gif: str(b.gif) || undefined });
    return json({ message: m }, 201);
  });
}

export function publicRequestsGet(db: Db, q: { user: SessionUser | null }): Promise<Response> {
  return publicGuard(async () => {
    const viewer = await viewerOf(db, q.user);
    const [config, requests] = await Promise.all([getChatConfig(db), listRequestsPublic(db, { clientId: viewer.clientId ?? undefined })]);
    return json({ config, requests, viewer: { signedIn: viewer.signedIn, nickname: viewer.nickname } });
  });
}

export function publicRequestPost(db: Db, body: unknown, ip: string, user: SessionUser | null): Promise<Response> {
  return publicGuard(async () => {
    if (!user) return authRequired();
    const b = asObj(body);
    if (!b) return json({ error: "Petición no válida." }, 400);
    const id = await chatIdentity(db, user);
    const byClient = rateLimit(`req:c:${id.clientId}`, 1, 20_000);
    if (!byClient.ok) return tooFast(byClient.retryAfterMs, "Espera unos segundos antes de pedir otra canción.");
    const byIp = rateLimit(`req:ip:${ip}`, 6, 60_000);
    if (!byIp.ok) return tooFast(byIp.retryAfterMs, "Demasiados pedidos desde tu conexión. Espera un momento.");
    const r = await createRequest(db, { clientId: id.clientId, nickname: id.nickname, title: str(b.title), artist: str(b.artist) || undefined, note: str(b.note) || undefined });
    return json(r, r.duplicate ? 200 : 201);
  });
}

/* ───────────── GIF propios ───────────── */

/** Mis GIF: lista (GET), subir (POST multipart «file») y borrar (DELETE ?id=). Solo con sesión. */
export function userGifsHandler(db: Db, user: SessionUser | null, request: Request, root: string): Promise<Response> {
  return publicGuard(async () => {
    if (!user) return authRequired();
    if (request.method === "GET") return json({ gifs: await listUserGifs(db, user.id) });
    if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
    if (request.method === "DELETE") {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "GIF no válido." }, 400);
      await removeUserGif(db, user.id, root, id);
      return json({ ok: true });
    }
    const declared = Number(request.headers.get("content-length") ?? "NaN");
    if (!Number.isFinite(declared)) return json({ error: "Falta el tamaño del contenido." }, 411);
    if (declared > 2.5 * 1024 * 1024) return json({ error: "El GIF supera el máximo de 2 MB." }, 413);
    if (!rateLimit(`chat:gif:${user.id}`, 10, 3600_000).ok) return json({ error: "Subiste muchos GIF seguidos. Espera un rato." }, 429);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "Cuerpo no válido." }, 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "Elige un GIF." }, 400);
    return json({ gif: await uploadUserGif(db, user.id, root, file) }, 201);
  });
}

/* ───────────── Estudio ───────────── */

/** Un solo sondeo trae todo lo que el DJ necesita: interruptores, mensajes nuevos y pedidos pendientes. */
export function studioChatFeed(db: Db, actor: Actor | null, q: { after: string | null }): Promise<Response> {
  return guarded(actor, async () => {
    const [config, list, requests] = await Promise.all([
      getChatConfig(db),
      listMessagesAdmin(db, actor, { after: cursor(q.after) }),
      listRequestsAdmin(db, actor, { status: "pending" }),
    ]);
    return Response.json({ config, ...list, requests }, { headers: NO_STORE });
  });
}

export function studioChatAction(db: Db, actor: Actor | null, body: unknown): Promise<Response> {
  return guarded(actor, async () => {
    const b = asObj(body);
    if (!b) return reply(400, "Petición no válida.");
    switch (b.action) {
      case "delete":
        if (typeof b.id !== "number") return reply(400, "Mensaje no válido.");
        await deleteMessage(db, actor, b.id);
        return Response.json({ ok: true });
      case "mute":
        if (typeof b.clientId !== "string" || typeof b.minutes !== "number") return reply(400, "Datos no válidos.");
        await muteClient(db, actor, b.clientId, b.minutes);
        return Response.json({ ok: true });
      case "request":
        if (typeof b.id !== "string" || !["pending", "played", "rejected"].includes(str(b.status))) return reply(400, "Datos no válidos.");
        await setRequestStatus(db, actor, b.id, b.status as RequestStatus);
        return Response.json({ ok: true });
      case "config":
        await saveChatConfig(db, actor, { enabled: b.enabled === true, requestsEnabled: b.requestsEnabled === true });
        return Response.json({ ok: true });
      default:
        return reply(400, "Acción no válida.");
    }
  });
}
