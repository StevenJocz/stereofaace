import { describe, expect, it, vi } from "vitest";
import { authorizeUrl, exchangeCode, fetchCurrentlyPlaying, pkceChallenge, refreshTokens, SpotifyAuthError } from "@/ui/studio/spotify-auth";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers });

describe("PKCE", () => {
  it("el code_challenge coincide con el vector de ejemplo del RFC 7636", async () => {
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("el enlace de autorización pide solo ver lo que suena y usa S256", () => {
    const u = new URL(authorizeUrl({ clientId: "cid", redirectUri: "https://x.test/cb", challenge: "ch", state: "st" }));
    expect(u.origin + u.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid",
      response_type: "code",
      redirect_uri: "https://x.test/cb",
      code_challenge_method: "S256",
      code_challenge: "ch",
      state: "st",
      scope: "user-read-currently-playing",
    });
  });
});

describe("intercambio de tokens", () => {
  it("canjea el código con el verifier y calcula la caducidad", async () => {
    const f = vi.fn(async () => json(200, { access_token: "A", refresh_token: "R", expires_in: 3600 }));
    const t = await exchangeCode({ clientId: "cid", redirectUri: "https://x.test/cb", code: "c", verifier: "v" }, f as unknown as typeof fetch, 1_000);
    expect(t).toEqual({ access: "A", refresh: "R", expiresAt: 1_000 + 3_600_000 });
    const body = (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(Object.fromEntries(body)).toEqual({ grant_type: "authorization_code", code: "c", redirect_uri: "https://x.test/cb", client_id: "cid", code_verifier: "v" });
  });

  it("al renovar conserva el refresh token si Spotify no manda uno nuevo", async () => {
    const f = vi.fn(async () => json(200, { access_token: "A2", expires_in: 3600 }));
    expect((await refreshTokens({ clientId: "cid", refresh: "R" }, f as unknown as typeof fetch, 0)).refresh).toBe("R");
  });

  it("invalid_grant pide volver a conectar", async () => {
    const f = vi.fn(async () => json(400, { error: "invalid_grant" }));
    await expect(refreshTokens({ clientId: "cid", refresh: "R" }, f as unknown as typeof fetch)).rejects.toMatchObject({ reauth: true });
    await expect(refreshTokens({ clientId: "cid", refresh: "R" }, f as unknown as typeof fetch)).rejects.toBeInstanceOf(SpotifyAuthError);
  });

  it("un fallo de red no obliga a reconectar", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("network");
    });
    await expect(refreshTokens({ clientId: "cid", refresh: "R" }, f as unknown as typeof fetch)).rejects.toMatchObject({ reauth: false });
  });
});

describe("qué está sonando", () => {
  const call = (res: Response) => fetchCurrentlyPlaying("tok", (async () => res) as unknown as typeof fetch);
  it("distingue 200, 204, 401, 429 y otros errores", async () => {
    expect(await call(json(200, { a: 1 }))).toEqual({ kind: "ok", body: { a: 1 } });
    expect(await call(json(204, null))).toEqual({ kind: "nothing" });
    expect(await call(json(401, {}))).toEqual({ kind: "unauthorized" });
    expect(await call(json(429, {}, { "retry-after": "7" }))).toEqual({ kind: "limited", retryMs: 7000 });
    expect(await call(json(500, {}))).toEqual({ kind: "error", status: 500 });
  });
  it("manda el token como Bearer", async () => {
    const f = vi.fn(async () => json(204, null));
    await fetchCurrentlyPlaying("tok", f as unknown as typeof fetch);
    expect((f.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers.authorization).toBe("Bearer tok");
  });
});
