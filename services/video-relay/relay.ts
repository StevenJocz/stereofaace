import { buildArgs, redact, validateIngestUrl } from "./ffmpeg.ts";

export type Child = {
  kill(signal?: string): void;
  on(event: "exit", cb: (code: number | null) => void): void;
  onStderr(cb: (line: string) => void): void;
};
export type Env = {
  spawn: (args: string[]) => Child;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
  now: () => number;
  log: (line: string) => void;
};

const STABLE_MS = 5000; // vivo este tiempo = la entrada llegó; si cae antes, se reintenta leer la cámara
const MAX_TRIES = 15;

/** Supervisa un único FFmpeg. Mientras no haya estado estable reintenta (la cámara puede tardar en llegar a MediaMTX). */
export function createRelay(env: Env) {
  let child: Child | null = null;
  let ingest: string | null = null;
  let desired = false;
  let running = false;
  let tries = 0;
  let startedAt = 0;
  let lastError: string | undefined;
  let timer: unknown = null;

  const launch = () => {
    if (!desired || !ingest) return;
    const url = ingest;
    startedAt = env.now();
    const c = env.spawn(buildArgs(url));
    child = c;
    running = true;
    c.onStderr((line) => env.log(redact(line, url)));
    c.on("exit", (code) => {
      if (child !== c) return;
      child = null;
      const stable = env.now() - startedAt >= STABLE_MS;
      if (desired && !stable && tries < MAX_TRIES) {
        tries++;
        timer = env.setTimeout(launch, 1000);
        return;
      }
      running = false;
      if (desired) lastError = stable ? "La señal se cortó." : "No se pudo leer la cámara.";
      env.log(`ffmpeg terminó (código ${code ?? "?"})`);
    });
  };

  return {
    start(rawUrl: unknown) {
      const u = validateIngestUrl(rawUrl);
      this.stop();
      ingest = u.toString();
      desired = true;
      tries = 0;
      lastError = undefined;
      launch();
    },
    stop() {
      desired = false;
      running = false;
      if (timer) env.clearTimeout(timer);
      timer = null;
      const c = child;
      child = null;
      ingest = null;
      c?.kill("SIGTERM");
    },
    status(): { running: boolean; error?: string } {
      return { running, ...(lastError ? { error: lastError } : {}) };
    },
  };
}
