import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import type { Actor } from "@/lib/rbac";
import { users, videoSessions } from "@/db/schema";
import { beginYouTubeConnect } from "@/modules/video/service";
import { publicVideoHandler, sameOrigin, videoStartHandler, videoStatusHandler, videoStopHandler, videoWhipHandler, youtubeConnectCallbackHandler, youtubeConnectStartHandler } from "@/modules/video/http";
import { makeDb } from "./helpers";
import { ANSWER, INGEST, OFFER, fakeDeps } from "./video-helpers";

let h: DbHandle;
let root: Actor;
let admin: Actor;
let editor: Actor;
const ORIGIN = "http://localhost:3000";
const SITE = "https://stereoface.online";

const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
const post = (path: string, headers: Record<string, string> = {}, body?: string) =>
  new Request(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, ...headers }, body });
const endActive = () => h.db.update(videoSessions).set({ active: false, state: "ended" }).where(eq(videoSessions.active, true));

beforeAll(async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
  vi.stubEnv("VIDEO_SECRET_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("VIDEO_RELAY_TOKEN", "t".repeat(32));
  vi.stubEnv("VIDEO_RELAY_URL", "http://video-relay:8080");
  vi.stubEnv("VIDEO_WHIP_URL", "http://mediamtx:8889");
  h = await makeDb();
  root = await mk("superadmin", "root");
  admin = await mk("admin", "adm");
  editor = await mk("editor", "edi");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await h.close();
});
beforeEach(async () => {
  resetRateLimits();
  await endActive();
});

describe("defensa CSRF", () => {
  it("el Origin debe ser el propio sitio", () => {
    expect(sameOrigin(post("/x"), SITE)).toBe(false); // localhost ≠ sitio, sin Host coincidente
    expect(sameOrigin(new Request(`${SITE}/x`, { method: "POST", headers: { origin: SITE } }), SITE)).toBe(true);
    expect(sameOrigin(new Request(`${SITE}/x`, { method: "POST", headers: { origin: "https://evil.example" } }), SITE)).toBe(false);
    expect(sameOrigin(new Request(`${SITE}/x`, { method: "POST" }), SITE)).toBe(false); // sin Origin
    expect(sameOrigin(new Request(`${SITE}/x`, { method: "POST", headers: { origin: "https://stereoface.online.evil.io" } }), SITE)).toBe(false);
  });
});

describe("sesión y permisos", () => {
  it("sin sesión: 401 en todas las rutas de cabina", async () => {
    const { deps } = fakeDeps();
    expect((await videoStatusHandler(h.db, null, deps)).status).toBe(401);
    expect((await videoStartHandler(h.db, null, post("/s"), deps)).status).toBe(401);
    expect((await videoWhipHandler(h.db, null, post("/w"), deps)).status).toBe(401);
    expect((await videoStopHandler(h.db, null, post("/p"), deps)).status).toBe(401);
  });
  it("editorial: 403", async () => {
    const { deps } = fakeDeps();
    expect((await videoStatusHandler(h.db, editor, deps)).status).toBe(403);
    expect((await videoStartHandler(h.db, editor, post("/s"), deps)).status).toBe(403);
  });
  it("sin Origin o con un Origin ajeno: 403 aunque haya sesión", async () => {
    const { deps } = fakeDeps();
    for (const handler of [videoStartHandler, videoWhipHandler, videoStopHandler]) {
      expect((await handler(h.db, admin, new Request(`${ORIGIN}/x`, { method: "POST" }), deps)).status).toBe(403);
      expect((await handler(h.db, admin, post("/x", { origin: "https://evil.example" }), deps)).status).toBe(403);
    }
  });
});

describe("iniciar y señalizar", () => {
  it("start entrega credencial temporal y estado, sin ninguna clave", async () => {
    const { deps } = fakeDeps();
    const res = await videoStartHandler(h.db, admin, post("/s"), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ ticket: expect.any(String), session: { state: "ready" } });
    expect(text).not.toContain("SECRET-STREAM-KEY");
    expect(text).not.toContain("rtmp://");
  });

  it("cabina ocupada: 409; sin configurar el servidor de video: 503", async () => {
    const { deps } = fakeDeps();
    await videoStartHandler(h.db, admin, post("/s"), deps);
    expect((await videoStartHandler(h.db, root, post("/s"), deps)).status).toBe(409);
    await endActive();
    vi.stubEnv("VIDEO_RELAY_TOKEN", "");
    expect((await videoStartHandler(h.db, admin, post("/s"))).status).toBe(503);
    vi.stubEnv("VIDEO_RELAY_TOKEN", "t".repeat(32));
  });

  it("límite de intentos: el séptimo en un minuto recibe 429", async () => {
    const { deps } = fakeDeps();
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await videoStartHandler(h.db, admin, post("/s"), deps)).status);
    expect(codes.slice(0, 6)).not.toContain(429);
    expect(codes[6]).toBe(429);
  });

  describe("whip", () => {
    async function ticket() {
      const { deps } = fakeDeps();
      const { ticket: t } = await (await videoStartHandler(h.db, admin, post("/s"), deps)).json();
      return { t, deps };
    }
    const whip = (t: string | null, body = OFFER, type = "application/sdp", extra: Record<string, string> = {}) =>
      post("/w", { "content-type": type, "content-length": String(Buffer.byteLength(body)), ...(t ? { authorization: `Bearer ${t}` } : {}), ...extra }, body);

    it("201 con la respuesta SDP", async () => {
      const { t, deps } = await ticket();
      const res = await videoWhipHandler(h.db, admin, whip(t), deps);
      expect(res.status).toBe(201);
      expect(res.headers.get("content-type")).toBe("application/sdp");
      expect(await res.text()).toBe(ANSWER);
    });
    it("tipo de contenido, tamaño, credencial y reutilización", async () => {
      const { t, deps } = await ticket();
      expect((await videoWhipHandler(h.db, admin, whip(t, OFFER, "text/plain"), deps)).status).toBe(415);
      expect((await videoWhipHandler(h.db, admin, whip(t, OFFER, "application/sdp", { "content-length": "999999" }), deps)).status).toBe(413);
      expect((await videoWhipHandler(h.db, admin, whip(null), deps)).status).toBe(401);
      expect((await videoWhipHandler(h.db, admin, whip(t, OFFER + "m=audio 9 RTP/AVP 0\r\n"), deps)).status).toBe(400);
      expect((await videoWhipHandler(h.db, admin, whip(t), deps)).status).toBe(201);
      expect((await videoWhipHandler(h.db, admin, whip(t), deps)).status).toBe(403); // un solo uso
    });
    it("la clave de YouTube nunca aparece en una respuesta de error", async () => {
      const f = fakeDeps();
      f.st.failWhip = true;
      const { ticket: t } = await (await videoStartHandler(h.db, admin, post("/s"), f.deps)).json();
      const res = await videoWhipHandler(h.db, admin, whip(t), f.deps);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await res.text()).not.toContain(INGEST.split("/").pop()!);
    });
  });

  it("stop devuelve el estado final y es idempotente", async () => {
    const { deps } = fakeDeps();
    await videoStartHandler(h.db, admin, post("/s"), deps);
    const res = await videoStopHandler(h.db, admin, post("/p"), deps);
    expect(res.status).toBe(200);
    expect((await res.json()).session).toBeNull();
    expect((await videoStopHandler(h.db, admin, post("/p"), deps)).status).toBe(200);
  });
});

describe("consulta pública", () => {
  it("fuera del aire: solo {live:false}, con caché corta", async () => {
    const res = await publicVideoHandler(h.db, fakeDeps().deps);
    expect(await res.json()).toEqual({ live: false });
    expect(res.headers.get("cache-control")).toContain("s-maxage=3");
  });
  it("en vivo: solo el id del video y el título (nada del canal ni de claves)", async () => {
    await h.db.insert(videoSessions).values({ state: "live", userId: admin.id, broadcastId: "BROADCAST01", streamId: "S1", title: "StereoFace — En vivo desde cabina" });
    const f = fakeDeps();
    f.st.relayRunning = true; // con el relay caído, la conciliación cierra el directo (probado en video-service)
    const body = await (await publicVideoHandler(h.db, f.deps)).json();
    expect(body).toEqual({ live: true, videoId: "BROADCAST01", title: "StereoFace — En vivo desde cabina" });
  });
});

describe("conexión OAuth", () => {
  it("sin sesión redirige al login; con sesión, a Google con el alcance de YouTube", async () => {
    expect((await youtubeConnectStartHandler(h.db, null, SITE)).headers.get("location")).toBe(`${SITE}/admin/login`);
    const res = await youtubeConnectStartHandler(h.db, root, SITE);
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.origin).toBe("https://accounts.google.com");
    expect(loc.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/youtube");
    expect(loc.search).not.toContain("csecret"); // el secreto del cliente nunca viaja por la URL
  });
  it("un administrador (no superadmin) vuelve a ajustes con el motivo", async () => {
    const res = await youtubeConnectStartHandler(h.db, admin, SITE);
    expect(res.headers.get("location")).toContain("/admin/ajustes/youtube?error=");
  });
  it("el callback valida el estado; un error de Google o un código ausente no conectan", async () => {
    const g = (async (u: string) => (String(u).includes("/token") ? Response.json({ refresh_token: "R-SECRETO", access_token: "A" }) : Response.json({ items: [{ id: "UC", snippet: { title: "Canal" } }] }))) as unknown as typeof fetch;
    await beginYouTubeConnect(h.db, root);
    const bad = await youtubeConnectCallbackHandler(h.db, root, new URL(`${SITE}/cb?code=x&state=falso`), SITE, g);
    expect(bad.headers.get("location")).toContain("error=");
    const denied = await youtubeConnectCallbackHandler(h.db, root, new URL(`${SITE}/cb?error=access_denied`), SITE, g);
    expect(denied.headers.get("location")).toContain("error=");
    expect((await youtubeConnectCallbackHandler(h.db, root, new URL(`${SITE}/cb`), SITE, g)).headers.get("location")).toContain("error=");
    const s2 = new URL(await beginYouTubeConnect(h.db, root)).searchParams.get("state")!;
    const ok = await youtubeConnectCallbackHandler(h.db, root, new URL(`${SITE}/cb?code=x&state=${s2}`), SITE, g);
    expect(ok.headers.get("location")).toBe(`${SITE}/admin/ajustes/youtube?conectado=1`);
    expect(ok.headers.get("location")).not.toContain("SECRETO");
  });
});
