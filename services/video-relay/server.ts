import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline";
import { createRelay } from "./relay.ts";

const TOKEN = process.env.RELAY_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 8080);
if (TOKEN.length < 24) {
  console.error("RELAY_TOKEN falta o es demasiado corto (mínimo 24 caracteres).");
  process.exit(1);
}

const relay = createRelay({
  spawn: (args) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    return {
      kill: (s) => p.kill(s as NodeJS.Signals | undefined),
      on: (_e, cb) => p.on("exit", cb),
      onStderr: (cb) => createInterface({ input: p.stderr! }).on("line", cb),
    };
  },
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (t) => clearTimeout(t as NodeJS.Timeout),
  now: () => Date.now(),
  log: (line) => console.log(`[relay] ${line}`),
});

const authorized = (header: string | undefined) => {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && timingSafeEqual(given, want);
};

const send = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  if (req.url === "/health") return send(res, 200, { ok: true });
  if (!authorized(req.headers.authorization)) return send(res, 401, { error: "no autorizado" });
  if (req.method === "GET" && req.url === "/status") return send(res, 200, relay.status());
  if (req.method === "POST" && req.url === "/stop") {
    relay.stop();
    return send(res, 200, { ok: true });
  }
  if (req.method === "POST" && req.url === "/start") {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 2000) req.destroy();
    });
    req.on("end", () => {
      try {
        relay.start((JSON.parse(raw) as { ingestUrl?: unknown }).ingestUrl);
        send(res, 200, { ok: true });
      } catch {
        send(res, 400, { error: "petición no válida" });
      }
    });
    return;
  }
  send(res, 404, { error: "no encontrado" });
}).listen(PORT, "0.0.0.0", () => console.log(`[relay] escuchando en ${PORT}`));

process.on("SIGTERM", () => {
  relay.stop();
  process.exit(0);
});
