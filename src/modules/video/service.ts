import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { getProgramForDj } from "@/modules/schedule/dj";
import { siteSettings } from "@/modules/settings/schema";
import { djUsernameOf } from "@/modules/studio/dj-accounts";
import { recordAudit } from "@/modules/users/audit";
import { readVideoEnv, missingVideoEnv } from "./config";
import { decryptSecret, encryptSecret } from "./crypto";
import { RelayClient, forwardWhip, validateOffer } from "./gateway";
import { VIDEO_STATE_LABEL, assertTransition, isActiveState, type VideoState } from "./state";
import { YouTubeClient, authUrl, channelOf, exchangeCode, revokeToken, type Privacy, type StreamHealth, type BroadcastLife } from "./youtube";
import { videoSessions, videoTickets } from "./schema";

export const DEFAULT_TITLE = "StereoFace — En vivo desde cabina";
const KEY_YT = "video.youtube";
const KEY_OAUTH = "video.oauth";
const TICKET_TTL_MS = 2 * 60_000;
const CHECK_EVERY_MS = 3000;
const READY_TIMEOUT_MS = 120_000;
const STARTING_TIMEOUT_MS = 90_000;

/** Lo que el servicio necesita del exterior; se inyecta para que las pruebas nunca hablen con YouTube ni con el relay. */
export type VideoDeps = {
  youtube: {
    ensureStream(): Promise<{ id: string; ingestUrl: string }>;
    createBroadcast(o: { title: string; description: string; privacy: Privacy }): Promise<string>;
    bind(broadcastId: string, streamId: string): Promise<void>;
    streamHealth(streamId: string): Promise<StreamHealth>;
    broadcastLife(broadcastId: string): Promise<BroadcastLife | null>;
    transition(broadcastId: string, to: "testing" | "live" | "complete"): Promise<void>;
  };
  relay: { start(ingestUrl: string): Promise<void>; stop(): Promise<void>; status(): Promise<{ running: boolean; error?: string }> };
  whip: (offerSdp: string) => Promise<string>;
  now: () => Date;
};

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const isSuper = (a: Actor) => a.role === "superadmin";

type StoredYt = { refreshToken: string; channelId: string; channelTitle: string; connectedAt: string; privacy: Privacy };

async function readSetting<T>(db: Db, key: string): Promise<T | null> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
  return (row?.value as T | undefined) ?? null;
}
async function writeSetting(db: Db, key: string, value: unknown, by: string | null) {
  await db.insert(siteSettings).values({ key, value, updatedBy: by }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: by } });
}

/** Dependencias reales (YouTube + relay + MediaMTX) a partir del entorno y de la conexión guardada. */
export async function defaultDeps(db: Db): Promise<VideoDeps> {
  const env = readVideoEnv();
  if (!env) throw new DomainError("video_not_configured", `Falta configurar el servidor de video (${missingVideoEnv().join(", ")}).`);
  const stored = await readSetting<StoredYt>(db, KEY_YT);
  if (!stored) throw new DomainError("youtube_not_connected", "El canal de YouTube aún no está conectado. Un superadministrador debe conectarlo en Ajustes → YouTube.");
  const yt = new YouTubeClient({ clientId: env.googleClientId, clientSecret: env.googleClientSecret, refreshToken: decryptSecret(stored.refreshToken, env.secretKey) });
  const relay = new RelayClient(env.relayUrl, env.relayToken);
  return { youtube: yt, relay, whip: (sdp) => forwardWhip(env.whipUrl, sdp), now: () => new Date() };
}

/* ───────────────────────── vistas ───────────────────────── */

export type SessionView = {
  id: string;
  state: VideoState;
  label: string;
  title: string;
  privacy: Privacy;
  error: string | null;
  mine: boolean;
};

export type VideoAdminView = {
  envMissing: string[];
  connected: boolean;
  channelTitle: string | null;
  privacy: Privacy;
  session: SessionView | null;
};

type Row = typeof videoSessions.$inferSelect;
const toView = (r: Row, actor: Actor): SessionView => ({
  id: r.id,
  state: r.state as VideoState,
  label: VIDEO_STATE_LABEL[r.state as VideoState],
  title: r.title,
  privacy: r.privacy as Privacy,
  error: r.error,
  mine: r.userId === actor.id,
});

async function activeSession(db: Db): Promise<Row | null> {
  const [r] = await db.select().from(videoSessions).where(eq(videoSessions.active, true)).limit(1);
  return r ?? null;
}

/** Última sesión (activa o la más reciente con error) para mostrar el motivo del fallo. */
async function latestSession(db: Db): Promise<Row | null> {
  const active = await activeSession(db);
  if (active) return active;
  const [r] = await db.select().from(videoSessions).orderBy(desc(videoSessions.createdAt)).limit(1);
  return r && r.state === "error" && Date.now() - r.updatedAt.getTime() < 10 * 60_000 ? r : null;
}

export async function getVideoAdmin(db: Db, actor: Actor | null): Promise<VideoAdminView> {
  assertCan(actor, "studio:update");
  const stored = await readSetting<StoredYt>(db, KEY_YT);
  const s = await latestSession(db);
  return {
    envMissing: missingVideoEnv(),
    connected: Boolean(stored),
    channelTitle: stored?.channelTitle ?? null,
    privacy: stored?.privacy ?? "unlisted",
    session: s ? toView(s, actor) : null,
  };
}

/** Lo único que ve el público: si hay directo y qué video incrustar. Nunca claves ni datos del canal. */
export async function getPublicVideo(db: Db): Promise<{ live: false } | { live: true; videoId: string; title: string }> {
  const [r] = await db.select().from(videoSessions).where(and(eq(videoSessions.active, true), eq(videoSessions.state, "live"))).limit(1);
  return r?.broadcastId ? { live: true, videoId: r.broadcastId, title: r.title } : { live: false };
}

/* ───────────────────────── conexión con YouTube (solo superadmin) ───────────────────────── */

function assertSuper(actor: Actor | null): asserts actor is Actor {
  if (!actor || !isSuper(actor)) throw new DomainError("video_super_only", "Solo un superadministrador puede gestionar la conexión de YouTube.");
}

export async function beginYouTubeConnect(db: Db, actor: Actor | null): Promise<string> {
  assertSuper(actor);
  const env = readVideoEnv();
  if (!env) throw new DomainError("video_not_configured", `Falta configurar el servidor de video (${missingVideoEnv().join(", ")}).`);
  const state = randomBytes(24).toString("base64url");
  await writeSetting(db, KEY_OAUTH, { hash: sha(state), userId: actor.id, expiresAt: Date.now() + 10 * 60_000 }, actor.id);
  return authUrl({ clientId: env.googleClientId, redirectUri: env.redirectUri, state });
}

export async function finishYouTubeConnect(db: Db, actor: Actor | null, code: string, state: string, fetchImpl: typeof fetch = fetch): Promise<{ channelTitle: string }> {
  assertSuper(actor);
  const env = readVideoEnv();
  if (!env) throw new DomainError("video_not_configured", "Falta configurar el servidor de video.");
  const pending = await readSetting<{ hash: string; userId: string; expiresAt: number }>(db, KEY_OAUTH);
  // El estado se consume siempre (un solo intento) y debe coincidir, ser de esta persona y no estar vencido.
  await db.delete(siteSettings).where(eq(siteSettings.key, KEY_OAUTH));
  if (!pending || pending.userId !== actor.id || pending.expiresAt < Date.now() || pending.hash !== sha(state))
    throw new DomainError("video_oauth_state", "La conexión con Google expiró o no es válida. Empieza de nuevo.");
  const tokens = await exchangeCode({ clientId: env.googleClientId, clientSecret: env.googleClientSecret, redirectUri: env.redirectUri, code }, fetchImpl);
  const channel = await channelOf(tokens.accessToken, fetchImpl);
  const prev = await readSetting<StoredYt>(db, KEY_YT);
  const value: StoredYt = {
    refreshToken: encryptSecret(tokens.refreshToken, env.secretKey),
    channelId: channel.id,
    channelTitle: channel.title,
    connectedAt: new Date().toISOString(),
    privacy: prev?.privacy ?? "unlisted",
  };
  await writeSetting(db, KEY_YT, value, actor.id);
  await recordAudit(db, { userId: actor.id, action: "video.youtube.connect", entity: "settings", diff: { channel: channel.title } });
  return { channelTitle: channel.title };
}

export async function disconnectYouTube(db: Db, actor: Actor | null, fetchImpl: typeof fetch = fetch): Promise<void> {
  assertSuper(actor);
  if (await activeSession(db)) throw new DomainError("video_busy", "Hay una transmisión en curso. Finalízala antes de desconectar YouTube.");
  const env = readVideoEnv();
  const stored = await readSetting<StoredYt>(db, KEY_YT);
  if (stored && env) {
    try {
      await revokeToken(decryptSecret(stored.refreshToken, env.secretKey), fetchImpl);
    } catch {
      /* no se pudo descifrar: igual se borra lo guardado */
    }
  }
  await db.delete(siteSettings).where(eq(siteSettings.key, KEY_YT));
  await recordAudit(db, { userId: actor.id, action: "video.youtube.disconnect", entity: "settings" });
}

/** Privacidad de los directos nuevos. Solo un superadministrador decide hacerlos públicos. */
export async function setVideoPrivacy(db: Db, actor: Actor | null, privacy: Privacy): Promise<void> {
  assertSuper(actor);
  if (privacy !== "public" && privacy !== "unlisted") throw new DomainError("video_privacy", "Privacidad no válida.");
  const stored = await readSetting<StoredYt>(db, KEY_YT);
  if (!stored) throw new DomainError("youtube_not_connected", "Conecta primero el canal de YouTube.");
  await writeSetting(db, KEY_YT, { ...stored, privacy }, actor.id);
  await recordAudit(db, { userId: actor.id, action: "video.privacy", entity: "settings", diff: { privacy } });
}

/* ───────────────────────── transmisión ───────────────────────── */

/** Un locutor solo transmite dentro de su horario (como en el estudio); administradores y superadministradores, siempre. */
async function assertMayBroadcast(db: Db, actor: Actor, now: Date): Promise<void> {
  assertCan(actor, "studio:update");
  if (actor.role !== "locutor") return;
  const dj = await djUsernameOf(db, actor);
  const info = dj ? await getProgramForDj(db, actor, dj, now) : null;
  if (!info?.scheduled) throw new DomainError("video_out_of_schedule", "No es tu horario: la cámara solo se activa durante tu programa.");
}

async function setState(db: Db, id: string, from: VideoState, to: VideoState, extra: Partial<Row> = {}): Promise<void> {
  assertTransition(from, to);
  await db
    .update(videoSessions)
    .set({ state: to, stateAt: new Date(), active: isActiveState(to), ...(isActiveState(to) ? {} : { endedAt: new Date() }), ...extra })
    .where(eq(videoSessions.id, id));
}

async function fail(db: Db, s: Row, message: string, deps?: VideoDeps): Promise<void> {
  if (deps) {
    await deps.relay.stop().catch(() => undefined);
    if (s.broadcastId) await deps.youtube.transition(s.broadcastId, "complete").catch(() => undefined);
  }
  await db.update(videoSessions).set({ state: "error", active: false, error: message, endedAt: new Date() }).where(eq(videoSessions.id, s.id));
}

async function issueTicket(db: Db, sessionId: string, userId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(videoTickets).values({ tokenHash: sha(token), sessionId, userId, expiresAt: new Date(now.getTime() + TICKET_TTL_MS) });
  return token;
}

/**
 * Prepara el directo: crea (o reutiliza) la señal y el directo en YouTube y entrega una credencial temporal de un solo uso
 * para que el navegador publique por WebRTC. No hay claves de YouTube en la respuesta.
 */
export async function prepareBroadcast(db: Db, actor: Actor | null, deps: VideoDeps): Promise<{ ticket: string; session: SessionView; expiresInSec: number }> {
  assertCan(actor, "studio:update");
  const now = deps.now();
  await assertMayBroadcast(db, actor, now);
  const existing = await activeSession(db);
  if (existing) {
    // La misma persona que aún no conectó puede pedir otra credencial; en cualquier otro caso, la cabina está ocupada.
    if (existing.userId === actor.id && existing.state === "ready") {
      await db.delete(videoTickets).where(and(eq(videoTickets.sessionId, existing.id), isNull(videoTickets.usedAt)));
      return { ticket: await issueTicket(db, existing.id, actor.id, now), session: toView(existing, actor), expiresInSec: TICKET_TTL_MS / 1000 };
    }
    throw new DomainError("video_busy", "La cabina ya está transmitiendo. Finaliza esa transmisión primero.");
  }
  const stored = await readSetting<StoredYt>(db, KEY_YT);
  const privacy: Privacy = stored?.privacy ?? "unlisted";
  const stream = await deps.youtube.ensureStream();
  const broadcastId = await deps.youtube.createBroadcast({ title: DEFAULT_TITLE, description: "Directo de la cabina de StereoFace Radio. El audio es el de la radio.", privacy });
  await deps.youtube.bind(broadcastId, stream.id);
  let row: Row;
  try {
    [row] = await db.insert(videoSessions).values({ state: "ready", userId: actor.id, broadcastId, streamId: stream.id, privacy, title: DEFAULT_TITLE }).returning();
  } catch {
    await deps.youtube.transition(broadcastId, "complete").catch(() => undefined);
    throw new DomainError("video_busy", "La cabina ya está transmitiendo. Finaliza esa transmisión primero.");
  }
  await recordAudit(db, { userId: actor.id, action: "video.prepare", entity: "video_session", entityId: row.id, diff: { privacy } });
  return { ticket: await issueTicket(db, row.id, actor.id, now), session: toView(row, actor), expiresInSec: TICKET_TTL_MS / 1000 };
}

/** Canjea la credencial (una sola vez), entrega la oferta WebRTC a MediaMTX y arranca el relay hacia YouTube. Devuelve la respuesta SDP. */
export async function publishOffer(db: Db, actor: Actor | null, ticket: string, offer: unknown, deps: VideoDeps): Promise<string> {
  assertCan(actor, "studio:update");
  const sdp = validateOffer(offer);
  const now = deps.now();
  // Atómico: solo el primer uso, de la persona correcta y sin vencer.
  const [t] = await db
    .update(videoTickets)
    .set({ usedAt: now })
    .where(and(eq(videoTickets.tokenHash, sha(ticket)), eq(videoTickets.userId, actor.id), isNull(videoTickets.usedAt), gt(videoTickets.expiresAt, now)))
    .returning({ sessionId: videoTickets.sessionId });
  if (!t) throw new DomainError("video_ticket", "La credencial de transmisión no es válida, venció o ya se usó. Pulsa «Iniciar transmisión» otra vez.");
  const [s] = await db.select().from(videoSessions).where(eq(videoSessions.id, t.sessionId));
  if (!s || !s.active || s.state !== "ready") throw new DomainError("video_ticket", "Esa transmisión ya no está preparada.");
  let answer: string;
  try {
    answer = await deps.whip(sdp);
    const stream = await deps.youtube.ensureStream();
    await deps.relay.start(stream.ingestUrl);
  } catch (e) {
    const msg = e instanceof DomainError ? e.message : "No se pudo conectar la cámara con el servicio de video.";
    await fail(db, s, msg, deps);
    throw e instanceof DomainError ? e : new DomainError("relay_unavailable", msg);
  }
  await db.update(videoSessions).set({ checkedAt: null }).where(eq(videoSessions.id, s.id));
  return answer;
}

export async function stopBroadcast(db: Db, actor: Actor | null, deps: VideoDeps): Promise<void> {
  assertCan(actor, "studio:update");
  const s = await activeSession(db);
  if (!s) return;
  if (s.userId !== actor.id && actor.role !== "admin" && actor.role !== "superadmin") throw new DomainError("video_not_yours", "Solo quien inició la transmisión, o un administrador, puede finalizarla.");
  await finish(db, s, deps);
  await recordAudit(db, { userId: actor.id, action: "video.stop", entity: "video_session", entityId: s.id });
}

async function finish(db: Db, s: Row, deps: VideoDeps, note: string | null = null): Promise<void> {
  const from = s.state as VideoState;
  if (from !== "ending") await setState(db, s.id, from, "ending");
  await deps.relay.stop().catch(() => undefined);
  if (s.broadcastId) await deps.youtube.transition(s.broadcastId, "complete").catch(() => undefined);
  await setState(db, s.id, "ending", "ended", note ? { error: note } : {});
}

/**
 * Concilia el directo con YouTube y el relay, un paso por llamada (la consola de cabina la consulta cada pocos segundos):
 * preparada → previsualizando (YouTube ya recibe señal) → iniciando → en vivo. Si la señal se corta, lo cierra.
 */
export async function reconcile(db: Db, deps: VideoDeps): Promise<Row | null> {
  const now = deps.now();
  const s = await activeSession(db);
  if (!s) return null;
  // Reclama la comprobación: dos peticiones a la vez no repiten las mismas llamadas a YouTube.
  const claimed = await db
    .update(videoSessions)
    .set({ checkedAt: now })
    .where(and(eq(videoSessions.id, s.id), sql`(${videoSessions.checkedAt} is null or ${videoSessions.checkedAt} < ${new Date(now.getTime() - CHECK_EVERY_MS)})`))
    .returning();
  if (!claimed.length) return s;
  const age = now.getTime() - s.stateAt.getTime();
  try {
    if (s.state === "ready") {
      const relay = await deps.relay.status();
      if (relay.running && s.streamId && (await deps.youtube.streamHealth(s.streamId)) === "active") {
        await deps.youtube.transition(s.broadcastId!, "testing").catch(() => undefined); // sin monitor de prueba, YouTube puede no necesitarlo
        await setState(db, s.id, "ready", "previewing");
      } else if (relay.error) await fail(db, s, "El servicio de video no pudo leer la cámara. Inténtalo de nuevo.", deps);
      else if (age > READY_TIMEOUT_MS) await fail(db, s, "YouTube no recibió señal a tiempo. Revisa la conexión y vuelve a intentarlo.", deps);
    } else if (s.state === "previewing") {
      const life = await deps.youtube.broadcastLife(s.broadcastId!);
      if (life === "testing" || age > 8000) {
        await deps.youtube.transition(s.broadcastId!, "live");
        await setState(db, s.id, "previewing", "starting");
      }
    } else if (s.state === "starting") {
      if ((await deps.youtube.broadcastLife(s.broadcastId!)) === "live") await setState(db, s.id, "starting", "live", { liveAt: now });
      else if (age > STARTING_TIMEOUT_MS) await fail(db, s, "YouTube tardó demasiado en iniciar el directo.", deps);
    } else if (s.state === "live") {
      if (!(await deps.relay.status()).running) await finish(db, s, deps, "La señal de la cámara se cortó y el directo se cerró.");
    } else if (s.state === "ending") {
      await finish(db, s, deps);
    }
  } catch (e) {
    await fail(db, s, e instanceof DomainError ? e.message : "Falló la comprobación del directo.", deps);
  }
  return activeSession(db);
}

/** Estado para la consola de cabina: concilia (si hay directo y está configurado) y devuelve la vista. */
export async function pollVideo(db: Db, actor: Actor | null, deps?: VideoDeps): Promise<VideoAdminView> {
  assertCan(actor, "studio:update");
  if (await activeSession(db)) {
    try {
      await reconcile(db, deps ?? (await defaultDeps(db)));
    } catch (e) {
      if (!(e instanceof DomainError)) console.error("[video] conciliación", e instanceof Error ? e.name : "error");
    }
  }
  return getVideoAdmin(db, actor);
}

/** Consulta pública: además mantiene al día el directo aunque nadie tenga abierta la consola. */
export async function publicVideo(db: Db, deps?: VideoDeps) {
  if (await activeSession(db)) {
    try {
      await reconcile(db, deps ?? (await defaultDeps(db)));
    } catch {
      /* sin conciliar: se muestra lo último conocido */
    }
  }
  return getPublicVideo(db);
}
