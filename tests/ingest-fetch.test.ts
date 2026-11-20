import http from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { FeedFetchError, fetchFeedText, fetchPageHead, isPublicAddress, MAX_FEED_BYTES } from "@/modules/ingest/fetch";

let server: http.Server | null = null;
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())).then(() => (server = null)));

async function serve(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}
const anyAddress = { isPublic: () => true };

describe("isPublicAddress", () => {
  it("rechaza loopback, redes privadas, enlace local, metadatos de nube, multicast e IPv6 internas", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd12::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:127.0.0.1", "ff02::1", "no-es-ip"]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
  });
  it("acepta direcciones públicas", () => {
    for (const a of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(a), a).toBe(true);
  });
});

describe("fetchFeedText", () => {
  it("por defecto no se conecta a destinos internos (IP escrita, localhost, IPv6, metadatos de nube)", async () => {
    for (const u of ["http://127.0.0.1:1/feed", "http://localhost:1/feed", "http://[::1]:1/feed", "http://169.254.169.254/latest/meta-data/", "http://10.0.0.5/feed"]) {
      await expect(fetchFeedText(u), u).rejects.toThrow(FeedFetchError);
    }
  });

  it("rechaza un nombre que resuelve a una dirección privada (comprobación al conectar, no solo al guardar)", async () => {
    const lookup = ((_h: string, _o: unknown, cb: (e: Error | null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: "10.0.0.5", family: 4 }])) as never;
    await expect(fetchFeedText("http://feeds.example.test/rss", { lookup })).rejects.toThrow("Destino no permitido");
  });

  it("rechaza si UNA de las direcciones resueltas es privada", async () => {
    const lookup = ((_h: string, _o: unknown, cb: (e: Error | null, a: { address: string; family: number }[]) => void) =>
      cb(null, [{ address: "8.8.8.8", family: 4 }, { address: "192.168.0.9", family: 4 }])) as never;
    await expect(fetchFeedText("http://feeds.example.test/rss", { lookup })).rejects.toThrow("Destino no permitido");
  });

  it("solo http(s) y sin credenciales", async () => {
    await expect(fetchFeedText("file:///etc/passwd")).rejects.toThrow(FeedFetchError);
    await expect(fetchFeedText("ftp://x.test/feed")).rejects.toThrow(FeedFetchError);
    await expect(fetchFeedText("https://user:pass@x.test/feed")).rejects.toThrow(FeedFetchError);
    await expect(fetchFeedText("no es url")).rejects.toThrow("no es válida");
  });

  it("descarga el texto (también con gzip)", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/gz") {
        res.writeHead(200, { "content-encoding": "gzip" });
        res.end(gzipSync("<rss>gz</rss>"));
      } else res.end("<rss>plano</rss>");
    });
    expect(await fetchFeedText(`${base}/`, anyAddress)).toBe("<rss>plano</rss>");
    expect(await fetchFeedText(`${base}/gz`, anyAddress)).toBe("<rss>gz</rss>");
  });

  it("sigue redirecciones, pero no hacia un destino interno ni más de 3", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/ok") res.writeHead(302, { location: "/final" }).end();
      else if (req.url === "/final") res.end("<rss>fin</rss>");
      else if (req.url === "/evil") res.writeHead(302, { location: "http://10.0.0.5/secreto" }).end();
      else if (req.url === "/loop") res.writeHead(302, { location: "/loop" }).end();
      else res.writeHead(404).end();
    });
    const deps = { isPublic: (a: string) => a === "127.0.0.1" };
    expect(await fetchFeedText(`${base}/ok`, deps)).toBe("<rss>fin</rss>");
    await expect(fetchFeedText(`${base}/evil`, deps)).rejects.toThrow("Destino no permitido");
    await expect(fetchFeedText(`${base}/loop`, deps)).rejects.toThrow("Demasiadas redirecciones");
  });

  it("explica los errores del sitio y corta respuestas demasiado grandes", async () => {
    const base = await serve((req, res) => {
      if (req.url === "/500") res.writeHead(503).end("x");
      else res.end("a".repeat(MAX_FEED_BYTES + 10));
    });
    await expect(fetchFeedText(`${base}/500`, anyAddress)).rejects.toThrow("código 503");
    await expect(fetchFeedText(`${base}/big`, anyAddress)).rejects.toThrow("demasiado grande");
  });
});

describe("fetchPageHead", () => {
  it("devuelve el inicio de una página enorme (donde está el <head>) en vez de fallar", async () => {
    const base = await serve((_req, res) => res.end(`<html><head><meta property="og:image" content="https://cdn.x.test/a.jpg"></head><body>${"x".repeat(2 * 1024 * 1024)}</body></html>`));
    const html = await fetchPageHead(`${base}/`, anyAddress);
    expect(html).toContain('og:image');
    expect(html.length).toBeLessThanOrEqual(512 * 1024 + 65536);
  });

  it("mantiene las protecciones: no entra a destinos internos", async () => {
    await expect(fetchPageHead("http://127.0.0.1:1/")).rejects.toThrow(FeedFetchError);
  });
});
