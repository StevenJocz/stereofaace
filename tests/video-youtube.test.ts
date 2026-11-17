import { describe, expect, it } from "vitest";
import { STREAM_TITLE, YouTubeClient, authUrl, exchangeCode, revokeToken } from "@/modules/video/youtube";

type Call = { url: string; method: string; body: unknown; auth: string | null };

/** Servidor falso de Google/YouTube: nunca sale a la red. */
function google(routes: Record<string, (c: Call) => { status?: number; body: unknown }>) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const ct = String((init?.headers as Record<string, string> | undefined)?.["content-type"] ?? "");
    const raw = init?.body;
    const body = raw instanceof URLSearchParams ? Object.fromEntries(raw) : typeof raw === "string" && ct.includes("json") ? JSON.parse(raw) : raw;
    const call: Call = { url: u.origin + u.pathname + u.search, method: init?.method ?? "GET", body, auth: (init?.headers as Record<string, string> | undefined)?.authorization ?? null };
    calls.push(call);
    const key = `${call.method} ${u.origin}${u.pathname}`;
    const r = routes[key];
    if (!r) return new Response("{}", { status: 404 });
    const out = r(call);
    return new Response(JSON.stringify(out.body), { status: out.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const TOKEN = "POST https://oauth2.googleapis.com/token";
const creds = { clientId: "cid", clientSecret: "csecret", refreshToken: "REFRESH-TOKEN" };
const token = { [TOKEN]: () => ({ body: { access_token: "ACCESS", expires_in: 3600 } }) };

describe("OAuth", () => {
  it("la URL pide solo el alcance de YouTube, acceso offline y lleva el estado", () => {
    const u = new URL(authUrl({ clientId: "cid", redirectUri: "https://s.test/cb", state: "ST" }));
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("ST");
    expect(u.searchParams.get("client_secret")).toBeNull();
  });
  it("canjea el código y exige un refresh token", async () => {
    const ok = google({ [TOKEN]: () => ({ body: { refresh_token: "R", access_token: "A" } }) });
    expect(await exchangeCode({ clientId: "c", clientSecret: "s", redirectUri: "r", code: "x" }, ok.f)).toEqual({ refreshToken: "R", accessToken: "A" });
    const noRefresh = google({ [TOKEN]: () => ({ body: { access_token: "A" } }) });
    await expect(exchangeCode({ clientId: "c", clientSecret: "s", redirectUri: "r", code: "x" }, noRefresh.f)).rejects.toMatchObject({ code: "youtube_auth" });
  });
  it("revocar no falla aunque Google no responda", async () => {
    await expect(revokeToken("t", (async () => { throw new Error("red"); }) as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});

describe("YouTubeClient", () => {
  it("renueva el acceso con el refresh token y lo reutiliza hasta que caduca", async () => {
    const g = google({ ...token, "GET https://www.googleapis.com/youtube/v3/channels": () => ({ body: { items: [{ id: "UC1", snippet: { title: "StereoFace" } }] } }) });
    const yt = new YouTubeClient(creds, g.f);
    expect(await yt.channel()).toEqual({ id: "UC1", title: "StereoFace" });
    await yt.channel();
    expect(g.calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
    expect(g.calls[0].body).toMatchObject({ grant_type: "refresh_token", refresh_token: "REFRESH-TOKEN" });
    expect(g.calls[1].auth).toBe("Bearer ACCESS");
  });

  it("reutiliza la señal de StereoFace si ya existe (misma clave RTMP)", async () => {
    const g = google({
      ...token,
      "GET https://www.googleapis.com/youtube/v3/liveStreams": () => ({ body: { items: [{ id: "S1", snippet: { title: STREAM_TITLE }, cdn: { ingestionInfo: { ingestionAddress: "rtmp://a.rtmp.youtube.com/live2", streamName: "KEY-1" } } }] } }),
    });
    expect(await new YouTubeClient(creds, g.f).ensureStream()).toEqual({ id: "S1", ingestUrl: "rtmp://a.rtmp.youtube.com/live2/KEY-1" });
    expect(g.calls.some((c) => c.method === "POST" && c.url.includes("liveStreams"))).toBe(false);
  });

  it("si no existe, crea una señal reutilizable RTMP", async () => {
    const g = google({
      ...token,
      "GET https://www.googleapis.com/youtube/v3/liveStreams": () => ({ body: { items: [] } }),
      "POST https://www.googleapis.com/youtube/v3/liveStreams": () => ({ body: { id: "S2", cdn: { ingestionInfo: { ingestionAddress: "rtmp://a.rtmp.youtube.com/live2/", streamName: "KEY-2" } } } }),
    });
    expect((await new YouTubeClient(creds, g.f).ensureStream()).ingestUrl).toBe("rtmp://a.rtmp.youtube.com/live2/KEY-2");
    const post = g.calls.find((c) => c.method === "POST" && c.url.includes("liveStreams"))!;
    expect(post.body).toMatchObject({ cdn: { ingestionType: "rtmp" }, contentDetails: { isReusable: true } });
  });

  it("el directo nace con la privacidad pedida, embed permitido y sin inicio automático", async () => {
    const g = google({ ...token, "POST https://www.googleapis.com/youtube/v3/liveBroadcasts": () => ({ body: { id: "B1" } }) });
    expect(await new YouTubeClient(creds, g.f).createBroadcast({ title: "StereoFace — En vivo desde cabina", description: "d", privacy: "unlisted" })).toBe("B1");
    const post = g.calls.find((c) => c.url.includes("liveBroadcasts"))!;
    expect(post.body).toMatchObject({
      snippet: { title: "StereoFace — En vivo desde cabina" },
      status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
      contentDetails: { enableEmbed: true, enableAutoStart: false, enableAutoStop: false },
    });
  });

  it("transiciones y estado de la señal", async () => {
    const g = google({
      ...token,
      "POST https://www.googleapis.com/youtube/v3/liveBroadcasts/transition": () => ({ body: {} }),
      "GET https://www.googleapis.com/youtube/v3/liveStreams": () => ({ body: { items: [{ status: { streamStatus: "active" } }] } }),
    });
    const yt = new YouTubeClient(creds, g.f);
    await yt.transition("B1", "live");
    expect(g.calls.at(-1)!.url).toContain("broadcastStatus=live");
    expect(await yt.streamHealth("S1")).toBe("active");
  });

  it("los errores se traducen sin filtrar el cuerpo ni ninguna clave", async () => {
    const g = google({
      ...token,
      "GET https://www.googleapis.com/youtube/v3/liveStreams": () => ({ status: 403, body: { error: { errors: [{ reason: "liveStreamingNotEnabled" }], message: "streamKey=SECRETO-NO-FILTRAR" } } }),
    });
    const err = await new YouTubeClient(creds, g.f).ensureStream().catch((e) => e);
    expect(err.code).toBe("youtube_not_enabled");
    expect(err.message).not.toContain("SECRETO");
    const quota = google({ ...token, "GET https://www.googleapis.com/youtube/v3/channels": () => ({ status: 403, body: { error: { errors: [{ reason: "quotaExceeded" }] } } }) });
    expect((await new YouTubeClient(creds, quota.f).channel().catch((e) => e)).code).toBe("youtube_quota");
  });

  it("si Google rechaza el refresh token o no hay red, el aviso pide reconectar o revisar la red", async () => {
    const bad = google({ [TOKEN]: () => ({ status: 400, body: { error: "invalid_grant" } }) });
    expect((await new YouTubeClient(creds, bad.f).channel().catch((e) => e)).code).toBe("youtube_auth");
    const down = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
    expect((await new YouTubeClient(creds, down).channel().catch((e) => e)).code).toBe("youtube_network");
  });
});
