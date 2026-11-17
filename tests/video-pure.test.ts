import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, parseKey, redactSecrets } from "@/modules/video/crypto";
import { assertTransition, canTransition, isActiveState } from "@/modules/video/state";
import { missingVideoEnv, readVideoEnv } from "@/modules/video/config";
import { validateOffer } from "@/modules/video/gateway";
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
    VIDEO_RELAY_URL: "http://video-relay:8080/",
    VIDEO_RELAY_TOKEN: "t".repeat(32),
    VIDEO_WHIP_URL: "http://mediamtx:8889",
  };
  it("sin variables, avisa cuáles faltan (solo los nombres)", () => {
    expect(missingVideoEnv({})).toContain("GOOGLE_CLIENT_SECRET");
    expect(missingVideoEnv({ ...full, VIDEO_SECRET_KEY: "mala" })).toEqual(["VIDEO_SECRET_KEY"]);
    expect(readVideoEnv({}, "https://x.test")).toBeNull();
  });
  it("completo: redirección por defecto del sitio y direcciones sin barra final", () => {
    const e = readVideoEnv(full, "https://stereoface.online/")!;
    expect(e.redirectUri).toBe("https://stereoface.online/api/youtube/oauth/callback");
    expect(e.relayUrl).toBe("http://video-relay:8080");
  });
});

describe("oferta WebRTC del navegador", () => {
  const video = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n";
  it("acepta solo video", () => expect(validateOffer(video)).toBe(video));
  it("rechaza audio, ausencia de video, basura y tamaños excesivos", () => {
    expect(() => validateOffer(video + "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n")).toThrow(/solo envía video/);
    expect(() => validateOffer("v=0\r\ns=-\r\nt=0 0\r\nm=application 9 x\r\n")).toThrow(/no incluye video/);
    expect(() => validateOffer(42)).toThrow();
    expect(() => validateOffer("hola")).toThrow();
    expect(() => validateOffer(video + "a=x:" + "a".repeat(31_000))).toThrow();
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
