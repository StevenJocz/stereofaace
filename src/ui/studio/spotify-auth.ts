/**
 * Conexión con la cuenta de Spotify del locutor (OAuth 2.0 con PKCE, https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow).
 * PKCE no usa «client secret»: solo el Client ID público de la aplicación. El permiso es únicamente «ver qué está sonando».
 */
export const SPOTIFY_SCOPE = "user-read-currently-playing";
const AUTHORIZE = "https://accounts.spotify.com/authorize";
const TOKEN = "https://accounts.spotify.com/api/token";
const NOW = "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode";

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const randomToken = (bytes = 48) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** code_challenge = BASE64URL(SHA-256(code_verifier)) */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    response_type: "code",
    redirect_uri: p.redirectUri,
    code_challenge_method: "S256",
    code_challenge: p.challenge,
    state: p.state,
    scope: SPOTIFY_SCOPE,
  });
  return `${AUTHORIZE}?${q}`;
}

export type Tokens = { access: string; refresh: string | null; expiresAt: number };

export class SpotifyAuthError extends Error {
  constructor(
    message: string,
    /** El permiso ya no vale (se revocó o caducó): hay que volver a conectar. */
    readonly reauth: boolean,
  ) {
    super(message);
  }
}

type TokenReply = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };

async function requestTokens(body: Record<string, string>, fallbackRefresh: string | null, fetchImpl: typeof fetch, now: number): Promise<Tokens> {
  let res: Response;
  try {
    res = await fetchImpl(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  } catch {
    throw new SpotifyAuthError("No se pudo hablar con Spotify. Revisa la conexión.", false);
  }
  const data = (await res.json().catch(() => ({}))) as TokenReply;
  if (!res.ok || !data.access_token) {
    throw new SpotifyAuthError(data.error === "invalid_grant" ? "Spotify pide volver a conectar la cuenta." : "Spotify no aceptó la conexión.", data.error === "invalid_grant" || res.status === 400);
  }
  return { access: data.access_token, refresh: data.refresh_token ?? fallbackRefresh, expiresAt: now + Math.max(60, data.expires_in ?? 3600) * 1000 };
}

export const exchangeCode = (p: { clientId: string; redirectUri: string; code: string; verifier: string }, fetchImpl: typeof fetch = fetch, now = Date.now()) =>
  requestTokens({ grant_type: "authorization_code", code: p.code, redirect_uri: p.redirectUri, client_id: p.clientId, code_verifier: p.verifier }, null, fetchImpl, now);

export const refreshTokens = (p: { clientId: string; refresh: string }, fetchImpl: typeof fetch = fetch, now = Date.now()) =>
  requestTokens({ grant_type: "refresh_token", refresh_token: p.refresh, client_id: p.clientId }, p.refresh, fetchImpl, now);

export type NowReply = { kind: "ok"; body: unknown } | { kind: "nothing" } | { kind: "unauthorized" } | { kind: "limited"; retryMs: number } | { kind: "error"; status: number };

/** Una consulta de «qué está sonando». 204 = nada reproduciéndose. */
export async function fetchCurrentlyPlaying(access: string, fetchImpl: typeof fetch = fetch): Promise<NowReply> {
  const res = await fetchImpl(NOW, { headers: { authorization: `Bearer ${access}` }, cache: "no-store" });
  if (res.status === 204) return { kind: "nothing" };
  if (res.status === 401) return { kind: "unauthorized" };
  if (res.status === 429) return { kind: "limited", retryMs: Math.min(60, Math.max(1, Number(res.headers.get("retry-after")) || 5)) * 1000 };
  if (!res.ok) return { kind: "error", status: res.status };
  return { kind: "ok", body: await res.json().catch(() => null) };
}
