import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, parseKey, redactSecrets } from "@/modules/video/crypto";
import { assertTransition, canTransition, isActiveState } from "@/modules/video/state";
import { missingVideoEnv, readVideoEnv } from "@/modules/video/config";
import { validateIngestUrl } from "@/modules/video/gateway";
import { LiveKitGateway, apiUrlOf } from "@/modules/video/livekit";
import { cabinEmbedSrc } from "@/ui/cabin/youtube-embed";
import { apiErrorMessage, cameraErrorMessage } from "@/ui/studio/cabin-errors";

const key = randomBytes(32);

describe("cifrado de secretos", () => {
  it("ida y vuelta; cada cifrado es distinto y no contiene el texto original", () => {
    const a = encryptSecret("1//refresh-token-secreto", key);
    expect(a).not.toContain("refresh-token-secreto");
    expect(a).not.toBe(encryptSecret("1//refresh-token-secreto", key));
    expect(decryptSecret(a, key)).toBe("1//refresh-token-secreto");
  });
  it("con otra clave o manipulado no descifra y no revela el motivo", () => {
    const a = encryptSecret("secreto", key);
    expect(() => decryptSecret(a, randomBytes(32))).toThrow(/Reconecta YouTube/);
    expect(() => decryptSecret(a.slice(0, -3) + "AAA", key)).toThrow();
    expect(() => decryptSecret("basura", key)).toThrow();
  });
  it("la clave acepta base64 o hexadecimal de 32 bytes y rechaza el resto", () => {
    expect(parseKey(key.toString("base64"))).toHaveLength(32);
    expect(parseKey(key.toString("hex"))).toHaveLength(32);
    expect(() => parseKey("corta")).toThrow();
    expect(() => parseKey(undefined)).toThrow();
  });
  it("redactSecrets borra cualquier secreto conocido de un texto", () => {
    expect(redactSecrets("fallo en rtmp://a/live2/ABCD-1234 con ABCD-1234", ["ABCD-1234", null])).toBe("fallo en rtmp://a/live2/*** con ***");
  });
});

describe("máquina de estados del directo", () => {
  it("el camino feliz y las salidas permitidas", () => {
    const path = ["ready", "previewing", "starting", "live", "ending", "ended"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
    for (const s of ["ready", "previewing", "starting", "live", "ending"] as const) expect(canTransition(s, "error")).toBe(true);
  });
  it("no se salta fases ni se reabre un directo terminado", () => {
    expect(canTransition("ready", "live")).toBe(false);
    expect(canTransition("live", "previewing")).toBe(false);
    expect(canTransition("ended", "ready")).toBe(false);
    expect(canTransition("error", "live")).toBe(false);
    expect(() => assertTransition("ready", "live")).toThrow(/No se puede pasar/);
  });
  it("solo ended y error dejan de ser activos", () => {
    expect(["ready", "previewing", "starting", "live", "ending"].every((s) => isActiveState(s as never))).toBe(true);
    expect(isActiveState("ended")).toBe(false);
    expect(isActiveState("error")).toBe(false);
  });
});

describe("configuración por entorno", () => {
  const full = {
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "sec",
    VIDEO_SECRET_KEY: key.toString("base64"),
    LIVEKIT_URL: "wss://demo.livekit.cloud/",
    LIVEKIT_API_KEY: "APIkey",
    LIVEKIT_API_SECRET: "s".repeat(40),
  };
  it("sin variables, avisa cuáles faltan (solo los nombres)", () => {
    expect(missingVideoEnv({})).toContain("GOOGLE_CLIENT_SECRET");
    expect(missingVideoEnv({ ...full, VIDEO_SECRET_KEY: "mala" })).toEqual(["VIDEO_SECRET_KEY"]);
    expect(missingVideoEnv({ ...full, LIVEKIT_URL: "https://no-es-ws" })).toEqual(["LIVEKIT_URL"]);
    expect(readVideoEnv({}, "https://x.test")).toBeNull();
  });
  it("completo: redirección por defecto del sitio y direcciones sin barra final", () => {
    const e = readVideoEnv(full, "https://stereoface.online/")!;
    expect(e.redirectUri).toBe("https://stereoface.online/api/youtube/oauth/callback");
    expect(e.livekitUrl).toBe("wss://demo.livekit.cloud");
  });
});

describe("LiveKit", () => {
  const gw = new LiveKitGateway({ url: "wss://demo.livekit.cloud", apiKey: "APIkey", apiSecret: "s".repeat(40) });
  const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as { video: Record<string, unknown>; exp: number; nbf?: number; iat?: number; sub: string };

  it("la API HTTPS está en el mismo host que el WebSocket", () => {
    expect(apiUrlOf("wss://demo.livekit.cloud/")).toBe("https://demo.livekit.cloud");
    expect(apiUrlOf("ws://localhost:7880")).toBe("http://localhost:7880");
  });

  it("el token permite publicar SOLO la cámara: sin micrófono, sin suscribirse, sin datos ni administración, y dura 2 minutos", async () => {
    const { url, token } = await gw.mintPublishToken("cabina-abc", "Cabina StereoFace");
    expect(url).toBe("wss://demo.livekit.cloud");
    const c = claims(token);
    expect(c.video).toMatchObject({ room: "cabina", roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false, canPublishSources: ["camera"] });
    for (const k of ["roomAdmin", "roomCreate", "roomList", "roomRecord"]) expect(c.video[k] ?? false).toBe(false);
    expect(c.sub).toBe("cabina-abc");
    expect(c.exp - (c.nbf ?? c.iat ?? 0)).toBeLessThanOrEqual(120);
  });
});

describe("dirección de entrada de YouTube", () => {
  it("solo RTMP(S) de youtube.com con clave", () => {
    expect(validateIngestUrl("rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl")).toContain("youtube.com");
    expect(validateIngestUrl("rtmps://a.rtmps.youtube.com:443/live2/clave-larga")).toContain("rtmps");
  });
  it.each(["rtmp://evil.example.com/live2/clave", "http://a.rtmp.youtube.com/live2/k", "rtmp://a.rtmp.youtube.com/solo", "rtmp://user:p@a.rtmp.youtube.com/live2/k", "rtmp://youtube.com.evil.io/live2/k", "no es url", 5])("rechaza %s", (u) => {
    expect(() => validateIngestUrl(u)).toThrow();
  });
});

describe("embed público de YouTube", () => {
  it("siempre mudo y sin controles", () => {
    const u = new URL(cabinEmbedSrc("dQw4w9WgXcQ")!);
    expect(u.origin).toBe("https://www.youtube-nocookie.com");
    expect(u.pathname).toBe("/embed/dQw4w9WgXcQ");
    expect(u.searchParams.get("mute")).toBe("1");
    expect(u.searchParams.get("controls")).toBe("0");
    expect(u.searchParams.get("autoplay")).toBe("1");
  });
  it("un identificador raro no genera embed", () => {
    expect(cabinEmbedSrc("x")).toBeNull();
    expect(cabinEmbedSrc('abc"><script>')).toBeNull();
    expect(cabinEmbedSrc("../etc/passwd")).toBeNull();
  });
});

describe("mensajes de error para el locutor", () => {
  it("cámara denegada, no disponible, ocupada", () => {
    expect(cameraErrorMessage(new DOMException("x", "NotAllowedError"))).toMatch(/permiso/);
    expect(cameraErrorMessage(new DOMException("x", "NotFoundError"))).toMatch(/No se encontró/);
    expect(cameraErrorMessage(new DOMException("x", "NotReadableError"))).toMatch(/en uso/);
    expect(cameraErrorMessage(new Error("raro"))).toMatch(/No se pudo activar/);
  });
  it("sesión expirada, error de YouTube y fallo de red", () => {
    expect(apiErrorMessage(401, null)).toMatch(/sesión expiró/);
    expect(apiErrorMessage(502, { error: "YouTube respondió con el error 500." })).toMatch(/YouTube/);
    expect(apiErrorMessage(0, null)).toMatch(/conexión a internet/);
  });
});
