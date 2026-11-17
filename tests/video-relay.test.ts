import { describe, expect, it } from "vitest";
import { buildArgs, redact, validateIngestUrl } from "../services/video-relay/ffmpeg.ts";
import { createRelay, type Child, type Env } from "../services/video-relay/relay.ts";

const URL_OK = "rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop";

describe("argumentos de FFmpeg", () => {
  const args = buildArgs(URL_OK);
  it("toma solo el video de la cámara y una pista AAC silenciosa; el audio de la entrada nunca se mapea", () => {
    const maps = args.flatMap((a, i) => (a === "-map" ? [args[i + 1]] : []));
    expect(maps).toEqual(["0:v:0", "1:a:0"]);
    expect(args.join(" ")).toContain("anullsrc=channel_layout=stereo:sample_rate=44100");
    expect(args).toContain("aac");
    expect(args).not.toContain("0:a");
    expect(args.at(-1)).toBe(URL_OK);
  });
  it("lee por RTSP interno y emite FLV", () => {
    expect(args).toContain("rtsp://mediamtx:8554/cabina");
    expect(args[args.indexOf("-f", args.indexOf("-b:a"))! + 1]).toBe("flv");
  });
});

describe("destino permitido", () => {
  it("solo RTMP(S) de youtube.com con clave", () => {
    expect(validateIngestUrl(URL_OK).hostname).toBe("a.rtmp.youtube.com");
    expect(validateIngestUrl("rtmps://a.rtmps.youtube.com:443/live2/clave-larga").protocol).toBe("rtmps:");
  });
  it.each(["rtmp://evil.example.com/live2/clave", "http://a.rtmp.youtube.com/live2/k", "rtmp://a.rtmp.youtube.com/solo", "rtmp://user:p@a.rtmp.youtube.com/live2/k", "rtmp://youtube.com.evil.io/live2/k", 5])("rechaza %s", (u) => {
    expect(() => validateIngestUrl(u)).toThrow();
  });
});

describe("redacción de la clave", () => {
  it("la clave y la dirección completa nunca salen en un registro", () => {
    const line = `Connection to ${URL_OK} failed; key abcd-efgh-ijkl-mnop`;
    const out = redact(line, URL_OK);
    expect(out).not.toContain("abcd-efgh");
    expect(out).not.toContain("a.rtmp.youtube.com");
  });
});

/** FFmpeg simulado y reloj manual. */
function harness() {
  const children: { args: string[]; killed: boolean; exit: (code: number) => void; stderr: (l: string) => void }[] = [];
  const logs: string[] = [];
  const timers: (() => void)[] = [];
  let t = 0;
  const env: Env = {
    spawn: (args) => {
      let onExit: (c: number | null) => void = () => undefined;
      let onErr: (l: string) => void = () => undefined;
      const rec = { args, killed: false, exit: (c: number) => onExit(c), stderr: (l: string) => onErr(l) };
      children.push(rec);
      const c: Child = { kill: () => void (rec.killed = true), on: (_e, cb) => void (onExit = cb), onStderr: (cb) => void (onErr = cb) };
      return c;
    },
    setTimeout: (fn) => timers.push(fn),
    clearTimeout: () => undefined,
    now: () => t,
    log: (l) => logs.push(l),
  };
  return { env, children, logs, timers, advance: (ms: number) => void (t += ms) };
}

describe("supervisor del relay", () => {
  it("arranca FFmpeg con el destino y lo detiene sin dejar procesos", () => {
    const h = harness();
    const r = createRelay(h.env);
    r.start(URL_OK);
    expect(h.children).toHaveLength(1);
    expect(r.status()).toEqual({ running: true });
    r.stop();
    expect(h.children[0].killed).toBe(true);
    expect(r.status().running).toBe(false);
  });
  it("si la cámara aún no llegó a MediaMTX reintenta; si cae tras estar estable, queda detenido con error", () => {
    const h = harness();
    const r = createRelay(h.env);
    r.start(URL_OK);
    h.children[0].exit(1); // cae al instante: aún no había señal
    expect(h.timers).toHaveLength(1);
    h.timers.shift()!();
    expect(h.children).toHaveLength(2);
    h.advance(10_000);
    h.children[1].exit(1); // estaba estable y se cortó
    expect(r.status()).toEqual({ running: false, error: "La señal se cortó." });
    expect(h.children).toHaveLength(2);
  });
  it("no registra la clave aunque FFmpeg la imprima", () => {
    const h = harness();
    createRelay(h.env).start(URL_OK);
    h.children[0].stderr(`Failed to connect ${URL_OK}`);
    expect(h.logs.join("\n")).not.toContain("abcd-efgh");
  });
  it("rechaza un destino no permitido sin arrancar nada", () => {
    const h = harness();
    expect(() => createRelay(h.env).start("rtmp://evil.example.com/x/y")).toThrow();
    expect(h.children).toHaveLength(0);
  });
  it("un start nuevo sustituye al proceso anterior", () => {
    const h = harness();
    const r = createRelay(h.env);
    r.start(URL_OK);
    r.start("rtmp://b.rtmp.youtube.com/live2/otra-clave-larga");
    expect(h.children[0].killed).toBe(true);
    expect(h.children).toHaveLength(2);
  });
});
