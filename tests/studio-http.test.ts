import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { artHandler, fileHandler, libraryHandler, playlistsHandler } from "@/modules/studio/http";
import { saveStudioConfig } from "@/modules/studio/settings";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let redactor: Actor;
let bare: DbHandle; // base sin clave guardada

const mk = async (db: DbHandle["db"], role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

type Seen = { url: string; headers: Record<string, string> };
function upstream(respond: (url: string) => Response) {
  const seen: Seen[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return respond(String(url));
  }) as typeof fetch;
  return { impl, seen };
}
const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { "content-type": "application/json" } });

beforeAll(async () => {
  h = await makeDb();
  admin = await mk(h.db, "admin", "adm");
  editor = await mk(h.db, "editor", "ed");
  redactor = await mk(h.db, "redactor", "red");
  await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "stereo_face", apiKey: "ID:SECRET" });
  bare = await makeDb();
  await mk(bare.db, "admin", "adm2");
});
afterAll(async () => {
  await h.close();
  await bare.close();
});

describe("rutas del estudio", () => {
  it("sin sesión responde 401", async () => {
    const r = await libraryHandler(h.db, null, { path: "", q: null });
    expect(r.status).toBe(401);
  });

  it("un redactor no tiene permiso (403)", async () => {
    const r = await libraryHandler(h.db, redactor, { path: "", q: null });
    expect(r.status).toBe(403);
  });

  it("un editor sí puede usar la biblioteca", async () => {
    const u = upstream(() => json([{ path: "yarn013", text: "yarn013", type: "directory" }]));
    const r = await libraryHandler(h.db, editor, { path: "", q: null }, u.impl);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ folders: [{ path: "yarn013", name: "yarn013" }], files: [] });
  });

  it("rechaza rutas con .. (400)", async () => {
    const u = upstream(() => json([]));
    const r = await libraryHandler(h.db, admin, { path: "../etc", q: null }, u.impl);
    expect(r.status).toBe(400);
    expect(u.seen).toHaveLength(0);
  });

  it("con q busca por texto", async () => {
    const u = upstream(() => json([{ path: "a.mp3", text: "a.mp3", type: "media", media: { id: 4, path: "a.mp3", title: "Hallado", artist: "X", length: 60 } }]));
    const r = await libraryHandler(h.db, admin, { path: null, q: "hall" }, u.impl);
    expect(u.seen[0].url).toContain("searchPhrase=hall");
    expect((await r.json()).files[0].title).toBe("Hallado");
  });

  it("sin clave guardada responde 409 con un mensaje claro", async () => {
    const [a] = await bare.db.select().from(users);
    const r = await libraryHandler(bare.db, { id: a.id, role: a.role }, { path: "", q: null });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/clave/i);
  });

  it("si AzuraCast rechaza la clave responde 502", async () => {
    const u = upstream(() => new Response("no", { status: 401 }));
    const r = await libraryHandler(h.db, admin, { path: "", q: null }, u.impl);
    expect(r.status).toBe(502);
  });

  it("playlists: sin id lista las listas y con id devuelve sus pistas", async () => {
    const u = upstream((url) =>
      url.endsWith("/playlists")
        ? json([{ id: 2, name: "Creative Commons", num_songs: 3 }])
        : json([{ id: 1, path: "a.mp3", title: "A", artist: "", length: 10, playlists: [{ id: 2 }] }]),
    );
    const lists = await playlistsHandler(h.db, admin, null, u.impl);
    expect(await lists.json()).toEqual([{ id: 2, name: "Creative Commons", trackCount: 3 }]);
    const files = await playlistsHandler(h.db, admin, "2", u.impl);
    expect((await files.json()).map((f: { title: string }) => f.title)).toEqual(["A"]);
    expect((await playlistsHandler(h.db, admin, "dos", u.impl)).status).toBe(400);
  });

  it("file reenvía Range y devuelve 206 con las cabeceras de rango", async () => {
    const u = upstream(
      () =>
        new Response("abc", {
          status: 206,
          headers: { "content-type": "audio/mpeg", "content-range": "bytes 0-2/100", "content-length": "3", "accept-ranges": "bytes" },
        }),
    );
    const r = await fileHandler(h.db, admin, "7", "bytes=0-2", u.impl);
    expect(u.seen[0].headers.Range).toBe("bytes=0-2");
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 0-2/100");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("cache-control")).toContain("private");
    expect(await r.text()).toBe("abc");
  });

  it("file con id no numérico responde 400 y sin sesión 401", async () => {
    const u = upstream(() => new Response("x"));
    expect((await fileHandler(h.db, admin, "abc", null, u.impl)).status).toBe(400);
    expect((await fileHandler(h.db, null, "7", null, u.impl)).status).toBe(401);
    expect(u.seen).toHaveLength(0);
  });

  it("file pasa un 416 de AzuraCast como 416 (Range fuera de límites), no como 502", async () => {
    const u = upstream(() => new Response(null, { status: 416, headers: { "content-range": "bytes */100" } }));
    const r = await fileHandler(h.db, admin, "7", "bytes=500-600", u.impl);
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe("bytes */100");
  });

  it("art devuelve la carátula con su tipo y caché privada", async () => {
    const u = upstream(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } }));
    const r = await artHandler(h.db, editor, "7", u.impl);
    expect(u.seen[0].url).toBe("https://radio.example.org/api/station/stereo_face/art/7");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toContain("private");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("art: id no numérico 400, sin sesión 401, y no acepta contenido que no sea imagen", async () => {
    const u = upstream(() => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect((await artHandler(h.db, admin, "../x", u.impl)).status).toBe(400);
    expect((await artHandler(h.db, null, "7", u.impl)).status).toBe(401);
    expect((await artHandler(h.db, admin, "7", u.impl)).status).toBe(404);
  });
});
