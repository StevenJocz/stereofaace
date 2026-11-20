import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { createGunzip, createInflate } from "node:zlib";
import { isPublicHost } from "@/lib/validation";

/** Error de descarga con un mensaje seguro para mostrar en el panel. */
export class FeedFetchError extends Error {}

export const MAX_FEED_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

/** ¿La dirección IP (ya resuelta) es pública? Cubre IPv4, IPv6 y IPv4 mapeada en IPv6. */
export function isPublicAddress(address: string): boolean {
  let a = address.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(a);
  if (mapped) a = mapped[1];
  if (a === "::" || a === "::1" || a === "0.0.0.0") return false;
  if (isIP(a) === 6) {
    if (/^f[cd]/.test(a) || /^fe[89ab]/.test(a) || /^ff/.test(a)) return false; // ULA, enlace local, multicast
    if (a.startsWith("64:ff9b:") || a.startsWith("2001:db8:")) return false;
    return true;
  }
  if (isIP(a) === 4) {
    const [x, y] = a.split(".").map(Number);
    if (x >= 224) return false; // multicast y reservadas
    if (x === 192 && y === 0) return false;
    if (x === 198 && (y === 18 || y === 19)) return false;
    return isPublicHost(a);
  }
  return false;
}

export type FetchDeps = {
  /** Para pruebas: por defecto solo se permiten destinos públicos. */
  isPublic?: (address: string) => boolean;
  lookup?: typeof dnsLookup;
};

type Lookup = (hostname: string, options: { all?: boolean; family?: number }, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => void;

/** Resolver que rechaza, en el momento de conectar, cualquier dirección no pública (la conexión usa la misma resolución: sin «rebinding»). */
function guardedLookup(deps: FetchDeps): Lookup {
  const resolve = deps.lookup ?? dnsLookup;
  const isPublic = deps.isPublic ?? isPublicAddress;
  return (hostname, options, cb) => {
    (resolve as unknown as (h: string, o: object, c: (e: Error | null, a: LookupAddress[]) => void) => void)(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return cb(err, []);
      if (!addrs.length || addrs.some((x) => !isPublic(x.address))) return cb(new FeedFetchError("Destino no permitido."), []);
      if (options.all) return cb(null, addrs);
      cb(null, addrs[0].address, addrs[0].family);
    });
  };
}

type Hop = { status: number; location: string | null; body: string | null };

function once(url: URL, deps: FetchDeps): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup(deps) as never,
        timeout: TIMEOUT_MS,
        headers: {
          accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
          "accept-encoding": "gzip, deflate",
          "user-agent": "StereoFaceFeedReader/1.0 (+https://stereoface.online)",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location ?? null, body: null });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new FeedFetchError(`El sitio respondió con el código ${status}.`));
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = enc === "gzip" ? res.pipe(createGunzip()) : enc === "deflate" ? res.pipe(createInflate()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_FEED_BYTES) {
            req.destroy();
            reject(new FeedFetchError("El feed es demasiado grande (más de 3 MB)."));
            return;
          }
          chunks.push(c);
        });
        stream.on("end", () => resolve({ status, location: null, body: Buffer.concat(chunks).toString("utf8") }));
        stream.on("error", () => reject(new FeedFetchError("No se pudo leer la respuesta del sitio.")));
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new FeedFetchError("El sitio tardó demasiado en responder."));
    });
    req.on("error", (e) => reject(e instanceof FeedFetchError ? e : new FeedFetchError(`No se pudo conectar con el sitio (${(e as NodeJS.ErrnoException).code ?? "error de red"}).`)));
    req.end();
  });
}

/** Descarga el texto de un feed. Solo http(s), sin credenciales, destinos públicos, ≤3 redirecciones, ≤3 MB y 15 s. */
export async function fetchFeedText(rawUrl: string, deps: FetchDeps = {}): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FeedFetchError("La dirección del feed no es válida.");
  }
  const isPublic = deps.isPublic ?? isPublicAddress;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) throw new FeedFetchError("Solo se permiten direcciones http(s) sin credenciales.");
    // Una IP escrita directamente no pasa por DNS: se comprueba aquí.
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublic(url.hostname)) throw new FeedFetchError("Destino no permitido.");
    const res = await once(url, deps);
    if (res.body !== null) return res.body;
    if (!res.location) throw new FeedFetchError("Redirección sin destino.");
    try {
      url = new URL(res.location, url);
    } catch {
      throw new FeedFetchError("Redirección no válida.");
    }
  }
  throw new FeedFetchError("Demasiadas redirecciones.");
}
