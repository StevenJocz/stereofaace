import { and, asc, desc, eq, gt, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { siteSettings } from "@/modules/settings/schema";
import { gifByKey } from "./gifs";
import { chatMessages, chatMutes, songRequests } from "./schema";

const KEY = "chat";
const MAX_PENDING_PER_CLIENT = 3;
const KEEP_DAYS = 7;

/* ───────────── Validación ───────────── */

const nickname = z.string().trim().regex(/^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,19}$/u, "El apodo tiene de 2 a 20 letras o números");
/** Enlaces y atajos de enlace: el chat no los admite (anti-spam). */
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|co|io|me|ly|xyz|info|app|link|gl|cc|tv)\b|\bwa\.me\b|\bt\.me\b)/i;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const messageSchema = z
  .object({
    nickname,
    text: z.string().optional(),
    gif: z.string().optional(),
  })
  .transform((v) => ({ nickname: v.nickname, body: clean(v.text ?? ""), gif: v.gif ?? null }))
  .superRefine((v, ctx) => {
    if (v.gif !== null && !gifByKey(v.gif)) ctx.addIssue({ code: "custom", path: ["gif"], message: "GIF no válido" });
    if (v.body === "" && v.gif === null) ctx.addIssue({ code: "custom", path: ["text"], message: "Escribe un mensaje" });
    if (v.body.length > 280) ctx.addIssue({ code: "custom", path: ["text"], message: "Máximo 280 caracteres" });
    if (LINK.test(v.body)) ctx.addIssue({ code: "custom", path: ["text"], message: "No se permiten enlaces en el chat" });
  })
  .transform((v) => ({ nickname: v.nickname, body: v.body === "" ? null : v.body, gif: v.gif }));

export function validateMessage(raw: { nickname: string; text?: string; gif?: string }) {
  return messageSchema.parse(raw);
}

const requestSchema = z
  .object({
    nickname,
    title: z.string().transform(clean).pipe(z.string().min(1, "Escribe el título").max(100, "Máximo 100 caracteres")),
    artist: z.string().optional().transform((v) => clean(v ?? "")).pipe(z.string().max(100, "Máximo 100 caracteres")),
  })
  .superRefine((v, ctx) => {
    if (LINK.test(v.title) || LINK.test(v.artist)) ctx.addIssue({ code: "custom", path: ["title"], message: "No se permiten enlaces" });
  });

/* ───────────── Configuración (interruptores del equipo) ───────────── */

export type ChatConfig = { enabled: boolean; requestsEnabled: boolean };

export async function getChatConfig(db: Db): Promise<ChatConfig> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, KEY));
  const parsed = z.object({ enabled: z.boolean(), requestsEnabled: z.boolean() }).safeParse(row?.value);
  return parsed.success ? parsed.data : { enabled: false, requestsEnabled: false };
}

export async function saveChatConfig(db: Db, actor: Actor | null, cfg: ChatConfig): Promise<void> {
  assertCan(actor, "station:update");
  const value = { enabled: Boolean(cfg.enabled), requestsEnabled: Boolean(cfg.requestsEnabled) };
  await db
    .insert(siteSettings)
    .values({ key: KEY, value, updatedBy: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id } });
}

async function assertNotMuted(db: Db, clientId: string, now: Date) {
  const [m] = await db.select().from(chatMutes).where(eq(chatMutes.clientId, clientId));
  if (m && m.until.getTime() > now.getTime()) throw new DomainError("chat_muted", "El equipo silenció este chat para ti por un rato.");
}

/* ───────────── Mensajes ───────────── */

export type PublicMessage = { id: number; nickname: string; body: string | null; gif: string | null; at: string; mine: boolean };
export type AdminMessage = PublicMessage & { clientId: string };

export async function postMessage(
  db: Db,
  input: { clientId: string; nickname: string; text?: string; gif?: string },
  now: Date = new Date(),
): Promise<PublicMessage> {
  const cfg = await getChatConfig(db);
  if (!cfg.enabled) throw new DomainError("chat_off", "El chat está apagado en este momento.");
  const v = validateMessage(input);
  await assertNotMuted(db, input.clientId, now);
  const [row] = await db
    .insert(chatMessages)
    .values({ clientId: input.clientId, nickname: v.nickname, body: v.body, gif: v.gif, createdAt: now })
    .returning();
  if (row.seq % 100 === 0) await db.delete(chatMessages).where(lt(chatMessages.createdAt, new Date(now.getTime() - KEEP_DAYS * 86_400_000)));
  return { id: row.seq, nickname: row.nickname, body: row.body, gif: row.gif, at: row.createdAt.toISOString(), mine: true };
}

type ListQ = { after?: number; clientId?: string; limit?: number };

async function loadMessages(db: Db, q: ListQ) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 100);
  const where = and(isNull(chatMessages.deletedAt), q.after !== undefined ? gt(chatMessages.seq, q.after) : undefined);
  // Primera carga: los últimos N; con cursor: lo nuevo en orden.
  const rows =
    q.after === undefined
      ? (await db.select().from(chatMessages).where(where).orderBy(desc(chatMessages.seq)).limit(limit)).reverse()
      : await db.select().from(chatMessages).where(where).orderBy(asc(chatMessages.seq)).limit(limit);
  return rows;
}

/** Lectura pública: nunca incluye el identificador de nadie; solo si el mensaje es del propio navegador. */
export async function listMessages(db: Db, q: ListQ): Promise<{ messages: PublicMessage[]; last: number }> {
  const rows = await loadMessages(db, q);
  return {
    messages: rows.map((r) => ({ id: r.seq, nickname: r.nickname, body: r.body, gif: r.gif, at: r.createdAt.toISOString(), mine: q.clientId !== undefined && r.clientId === q.clientId })),
    last: rows.at(-1)?.seq ?? q.after ?? 0,
  };
}

/** Lectura del equipo: incluye el identificador para poder silenciar. */
export async function listMessagesAdmin(db: Db, actor: Actor | null, q: ListQ): Promise<{ messages: AdminMessage[]; last: number }> {
  assertCan(actor, "station:update");
  const rows = await loadMessages(db, q);
  return {
    messages: rows.map((r) => ({ id: r.seq, nickname: r.nickname, body: r.body, gif: r.gif, at: r.createdAt.toISOString(), mine: false, clientId: r.clientId })),
    last: rows.at(-1)?.seq ?? q.after ?? 0,
  };
}

export async function deleteMessage(db: Db, actor: Actor | null, seq: number): Promise<void> {
  assertCan(actor, "station:update");
  await db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.seq, seq));
}

/** Silencia a un navegador por `minutes` minutos; 0 levanta el silencio. */
export async function muteClient(db: Db, actor: Actor | null, clientId: string, minutes: number, now: Date = new Date()): Promise<void> {
  assertCan(actor, "station:update");
  if (!clientId || clientId.length > 80) throw new DomainError("bad_client", "Identificador no válido.");
  if (minutes <= 0) {
    await db.delete(chatMutes).where(eq(chatMutes.clientId, clientId));
    return;
  }
  const until = new Date(now.getTime() + Math.min(minutes, 60 * 24 * 30) * 60_000);
  await db
    .insert(chatMutes)
    .values({ clientId, until, createdBy: actor.id })
    .onConflictDoUpdate({ target: chatMutes.clientId, set: { until, createdBy: actor.id } });
}

/* ───────────── Pedidos de canciones ───────────── */

export type RequestStatus = "pending" | "played" | "rejected";
export type PublicRequest = { id: string; nickname: string; title: string; artist: string | null; status: RequestStatus; at: string; mine: boolean };
export type AdminRequest = Omit<PublicRequest, "mine"> & { createdAt: string };

export async function createRequest(
  db: Db,
  input: { clientId: string; nickname: string; title: string; artist?: string },
  now: Date = new Date(),
): Promise<{ id: string; duplicate: boolean }> {
  const cfg = await getChatConfig(db);
  if (!cfg.requestsEnabled) throw new DomainError("requests_off", "Los pedidos de canciones están cerrados por ahora.");
  const v = requestSchema.parse(input);
  await assertNotMuted(db, input.clientId, now);

  const mine = await db.select().from(songRequests).where(and(eq(songRequests.clientId, input.clientId), eq(songRequests.status, "pending")));
  const same = mine.find((r) => r.title.toLowerCase() === v.title.toLowerCase() && (r.artist ?? "").toLowerCase() === v.artist.toLowerCase());
  if (same) return { id: same.id, duplicate: true };
  if (mine.length >= MAX_PENDING_PER_CLIENT) throw new DomainError("request_limit", `Ya tienes ${MAX_PENDING_PER_CLIENT} pedidos esperando. Espera a que suenen.`);

  const [row] = await db
    .insert(songRequests)
    .values({ clientId: input.clientId, nickname: v.nickname, title: v.title, artist: v.artist || null, createdAt: now })
    .returning({ id: songRequests.id });
  return { id: row.id, duplicate: false };
}

/** Lo que ve el público: los pedidos recientes que no se rechazaron (sin identificadores). */
export async function listRequestsPublic(db: Db, q: { clientId?: string }): Promise<PublicRequest[]> {
  const rows = await db
    .select()
    .from(songRequests)
    .where(inArray(songRequests.status, ["pending", "played"]))
    .orderBy(desc(songRequests.createdAt))
    .limit(20);
  return rows.map((r) => ({ id: r.id, nickname: r.nickname, title: r.title, artist: r.artist, status: r.status as RequestStatus, at: r.createdAt.toISOString(), mine: q.clientId !== undefined && r.clientId === q.clientId }));
}

/** Para el DJ: del pedido más viejo al más nuevo. */
export async function listRequestsAdmin(db: Db, actor: Actor | null, q: { status?: RequestStatus } = {}): Promise<AdminRequest[]> {
  assertCan(actor, "station:update");
  const rows = await db
    .select()
    .from(songRequests)
    .where(q.status ? eq(songRequests.status, q.status) : undefined)
    .orderBy(asc(songRequests.createdAt))
    .limit(100);
  return rows.map((r) => ({ id: r.id, nickname: r.nickname, title: r.title, artist: r.artist, status: r.status as RequestStatus, at: r.createdAt.toISOString(), createdAt: r.createdAt.toISOString() }));
}

export async function setRequestStatus(db: Db, actor: Actor | null, id: string, status: RequestStatus): Promise<void> {
  assertCan(actor, "station:update");
  await db.update(songRequests).set({ status, handledBy: actor.id, handledAt: new Date() }).where(eq(songRequests.id, id));
}
