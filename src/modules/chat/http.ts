import { ZodError } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import type { Actor } from "@/lib/rbac";
import { guarded, reply } from "@/modules/studio/http";
import {
  createRequest,
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

const CLIENT_ID = /^[a-zA-Z0-9_-]{8,64}$/;
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

function identity(b: Record<string, unknown>): { clientId: string; nickname: string } | null {
  const clientId = str(b.clientId);
  return CLIENT_ID.test(clientId) ? { clientId, nickname: str(b.nickname) } : null;
}

const cursor = (v: string | null) => (v !== null && /^\d{1,15}$/.test(v) ? Number(v) : undefined);
const clientOf = (v: string | null) => (v && CLIENT_ID.test(v) ? v : undefined);

/* ───────────── Público ───────────── */

export function publicChatGet(db: Db, q: { after: string | null; clientId?: string | null }): Promise<Response> {
  return publicGuard(async () => {
    const [config, list] = await Promise.all([getChatConfig(db), listMessages(db, { after: cursor(q.after), clientId: clientOf(q.clientId ?? null) })]);
    return json({ config, ...list });
  });
}

export function publicChatPost(db: Db, body: unknown, ip: string): Promise<Response> {
  return publicGuard(async () => {
    const b = asObj(body);
    const id = b && identity(b);
    if (!b || !id) return json({ error: "Petición no válida." }, 400);
    const byClient = rateLimit(`chat:c:${id.clientId}`, 1, 2000);
    if (!byClient.ok) return tooFast(byClient.retryAfterMs, "Vas muy rápido: espera un par de segundos.");
    const byIp = rateLimit(`chat:ip:${ip}`, 15, 30_000);
    if (!byIp.ok) return tooFast(byIp.retryAfterMs, "Demasiados mensajes desde tu conexión. Espera un momento.");
    const m = await postMessage(db, { ...id, text: str(b.text) || undefined, gif: str(b.gif) || undefined });
    return json({ message: m }, 201);
  });
}

export function publicRequestsGet(db: Db, q: { clientId?: string | null }): Promise<Response> {
  return publicGuard(async () => {
    const [config, requests] = await Promise.all([getChatConfig(db), listRequestsPublic(db, { clientId: clientOf(q.clientId ?? null) })]);
    return json({ config, requests });
  });
}

export function publicRequestPost(db: Db, body: unknown, ip: string): Promise<Response> {
  return publicGuard(async () => {
    const b = asObj(body);
    const id = b && identity(b);
    if (!b || !id) return json({ error: "Petición no válida." }, 400);
    const byClient = rateLimit(`req:c:${id.clientId}`, 1, 20_000);
    if (!byClient.ok) return tooFast(byClient.retryAfterMs, "Espera unos segundos antes de pedir otra canción.");
    const byIp = rateLimit(`req:ip:${ip}`, 6, 60_000);
    if (!byIp.ok) return tooFast(byIp.retryAfterMs, "Demasiados pedidos desde tu conexión. Espera un momento.");
    const r = await createRequest(db, { ...id, title: str(b.title), artist: str(b.artist) || undefined, note: str(b.note) || undefined });
    return json(r, r.duplicate ? 200 : 201);
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
