import { DomainError } from "@/lib/errors";

const API = "https://www.googleapis.com/youtube/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
/** Gestionar directos y el canal propio; nada más. */
export const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube";
export const STREAM_TITLE = "StereoFace — Cabina (señal reutilizable)";

export type Privacy = "unlisted" | "public";
export type YtCreds = { clientId: string; clientSecret: string; refreshToken: string };
export type Ingest = { ingestUrl: string };
export type StreamInfo = { id: string; ingestUrl: string };
export type StreamHealth = "active" | "inactive" | "ready" | "created" | "error";
export type BroadcastLife = "created" | "ready" | "testing" | "testStarting" | "liveStarting" | "live" | "complete" | "revoked";

export function authUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: YOUTUBE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: o.state,
  });
  return `${AUTH_URL}?${q}`;
}

type GoogleError = { error?: { code?: number; message?: string; errors?: { reason?: string }[] } };

/** Traduce un fallo de YouTube a un mensaje seguro (solo el código y el motivo, nunca el cuerpo ni la clave). */
async function failure(res: Response): Promise<DomainError> {
  let reason = "";
  try {
    reason = ((await res.json()) as GoogleError).error?.errors?.[0]?.reason ?? "";
  } catch {
    /* sin cuerpo legible */
  }
  if (reason === "liveStreamingNotEnabled")
    return new DomainError("youtube_not_enabled", "El canal de YouTube no tiene habilitada la transmisión en vivo (puede tardar hasta 24 horas tras activarla).");
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded") return new DomainError("youtube_quota", "YouTube alcanzó el límite de uso por hoy. Inténtalo más tarde.");
  if (res.status === 401 || reason === "authError") return new DomainError("youtube_auth", "La conexión con YouTube ya no es válida. Un superadministrador debe reconectarla.");
  if (res.status === 403) return new DomainError("youtube_forbidden", `YouTube negó el permiso${reason ? ` (${reason})` : ""}. Revisa la conexión del canal.`);
  return new DomainError("youtube_error", `YouTube respondió con el error ${res.status}${reason ? ` (${reason})` : ""}.`);
}

/** Cliente mínimo de la API oficial de YouTube. Todo el tráfico sale del servidor; ningún secreto llega al navegador. */
export class YouTubeClient {
  private access: { token: string; expiresAt: number } | null = null;
  constructor(
    private readonly creds: YtCreds,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.access && this.access.expiresAt - 30_000 > this.now()) return this.access.token;
    let res: Response;
    try {
      res = await this.fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.creds.clientId, client_secret: this.creds.clientSecret, refresh_token: this.creds.refreshToken, grant_type: "refresh_token" }),
      });
    } catch {
      throw new DomainError("youtube_network", "No se pudo contactar con Google. Revisa la red del servidor.");
    }
    if (!res.ok) throw new DomainError("youtube_auth", "Google rechazó la conexión guardada. Un superadministrador debe reconectar YouTube.");
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) throw new DomainError("youtube_auth", "Google no entregó un acceso válido. Reconecta YouTube.");
    this.access = { token: j.access_token, expiresAt: this.now() + (j.expires_in ?? 3000) * 1000 };
    return this.access.token;
  }

  private async call<T>(method: "GET" | "POST", path: string, query: Record<string, string>, body?: unknown): Promise<T> {
    const token = await this.accessToken();
    let res: Response;
    try {
      res = await this.fetchImpl(`${API}${path}?${new URLSearchParams(query)}`, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new DomainError("youtube_network", "No se pudo contactar con YouTube. Revisa la red del servidor.");
    }
    if (!res.ok) throw await failure(res);
    return (await res.json()) as T;
  }

  /** Canal conectado (para mostrar a quién pertenece la conexión). */
  async channel(): Promise<{ id: string; title: string }> {
    const j = await this.call<{ items?: { id: string; snippet?: { title?: string } }[] }>("GET", "/channels", { part: "snippet", mine: "true" });
    const c = j.items?.[0];
    if (!c) throw new DomainError("youtube_no_channel", "La cuenta de Google no tiene un canal de YouTube.");
    return { id: c.id, title: c.snippet?.title ?? "Canal de YouTube" };
  }

  /** Reutiliza la señal propia de StereoFace (su clave RTMP no cambia) o la crea la primera vez. */
  async ensureStream(): Promise<StreamInfo> {
    type S = { id: string; snippet?: { title?: string }; cdn?: { ingestionInfo?: { ingestionAddress?: string; streamName?: string } } };
    const list = await this.call<{ items?: S[] }>("GET", "/liveStreams", { part: "id,snippet,cdn", mine: "true", maxResults: "50" });
    let s = list.items?.find((x) => x.snippet?.title === STREAM_TITLE);
    if (!s) {
      s = await this.call<S>(
        "POST",
        "/liveStreams",
        { part: "id,snippet,cdn,contentDetails" },
        { snippet: { title: STREAM_TITLE }, cdn: { ingestionType: "rtmp", resolution: "variable", frameRate: "variable" }, contentDetails: { isReusable: true } },
      );
    }
    const info = s.cdn?.ingestionInfo;
    if (!info?.ingestionAddress || !info.streamName) throw new DomainError("youtube_error", "YouTube no entregó la dirección de entrada de la señal.");
    return { id: s.id, ingestUrl: `${info.ingestionAddress.replace(/\/$/, "")}/${info.streamName}` };
  }

  /** Directo nuevo, sin inicio automático y con el reproductor incrustable. */
  async createBroadcast(o: { title: string; description: string; privacy: Privacy }): Promise<string> {
    const j = await this.call<{ id: string }>(
      "POST",
      "/liveBroadcasts",
      { part: "snippet,status,contentDetails" },
      {
        snippet: { title: o.title, description: o.description, scheduledStartTime: new Date(this.now() + 60_000).toISOString() },
        status: { privacyStatus: o.privacy, selfDeclaredMadeForKids: false },
        contentDetails: { enableAutoStart: false, enableAutoStop: false, enableDvr: false, enableEmbed: true, latencyPreference: "low", monitorStream: { enableMonitorStream: false } },
      },
    );
    return j.id;
  }

  async bind(broadcastId: string, streamId: string): Promise<void> {
    await this.call("POST", "/liveBroadcasts/bind", { id: broadcastId, part: "id", streamId });
  }

  async streamHealth(streamId: string): Promise<StreamHealth> {
    const j = await this.call<{ items?: { status?: { streamStatus?: StreamHealth } }[] }>("GET", "/liveStreams", { part: "status", id: streamId });
    return j.items?.[0]?.status?.streamStatus ?? "inactive";
  }

  async broadcastLife(broadcastId: string): Promise<BroadcastLife | null> {
    const j = await this.call<{ items?: { status?: { lifeCycleStatus?: BroadcastLife } }[] }>("GET", "/liveBroadcasts", { part: "status", id: broadcastId });
    return j.items?.[0]?.status?.lifeCycleStatus ?? null;
  }

  async transition(broadcastId: string, to: "testing" | "live" | "complete"): Promise<void> {
    await this.call("POST", "/liveBroadcasts/transition", { broadcastStatus: to, id: broadcastId, part: "status" });
  }
}

export async function exchangeCode(
  o: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ refreshToken: string; accessToken: string }> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, code: o.code, grant_type: "authorization_code" }),
    });
  } catch {
    throw new DomainError("youtube_network", "No se pudo contactar con Google. Revisa la red del servidor.");
  }
  if (!res.ok) throw new DomainError("youtube_auth", "Google no aceptó el código de autorización. Inténtalo de nuevo.");
  const j = (await res.json()) as { refresh_token?: string; access_token?: string };
  if (!j.refresh_token || !j.access_token)
    throw new DomainError("youtube_auth", "Google no entregó un acceso permanente. Revoca el acceso de StereoFace en tu cuenta de Google y conecta de nuevo.");
  return { refreshToken: j.refresh_token, accessToken: j.access_token };
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    await fetchImpl(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  } catch {
    /* si Google no responde, igualmente se borra lo guardado; el acceso se puede revocar a mano */
  }
}

export async function channelOf(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ id: string; title: string }> {
  const res = await fetchImpl(`${API}/channels?part=snippet&mine=true`, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw await failure(res);
  const j = (await res.json()) as { items?: { id: string; snippet?: { title?: string } }[] };
  const c = j.items?.[0];
  if (!c) throw new DomainError("youtube_no_channel", "La cuenta de Google no tiene un canal de YouTube.");
  return { id: c.id, title: c.snippet?.title ?? "Canal de YouTube" };
}
