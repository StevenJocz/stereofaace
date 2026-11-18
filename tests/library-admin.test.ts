import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { resetRateLimits } from "@/lib/rate-limit";
import {
  createFolder,
  deleteAutoDjPlaylist,
  fromAzSchedule,
  libraryBatch,
  listAutoDjPlaylists,
  safeDir,
  safeName,
  saveAutoDjPlaylist,
  toAzSchedule,
  uploadSong,
} from "@/modules/studio/library-admin";
import { autodjDeleteHandler, autodjListHandler, autodjSaveHandler, batchHandler, folderHandler, uploadHandler } from "@/modules/studio/library-http";
import { saveStudioConfig } from "@/modules/studio/settings";
import { makeDb } from "./helpers";

let h: DbHandle;
let locutor: Actor;
let redactor: Actor;
let admin: Actor;
const ORIGIN = "http://localhost:3000";

const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

/** AzuraCast simulado: anota cada petición y guarda las listas. */
function azura() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let playlists: Record<string, unknown>[] = [
    { id: 1, name: "Mañanas", source: "songs", type: "default", order: "shuffle", weight: 3, is_enabled: true, num_songs: 12, schedule_items: [{ start_time: 600, end_time: 900, days: [1, 2, 3, 4, 5], start_date: null, end_date: null, loop_once: false }] },
    { id: 2, name: "Señal", source: "remote_url", remote_url: "https://x.example/stream", is_enabled: true },
  ];
  const f = (async (url: string, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = u.pathname.replace("/api/station/stereo_face", "") + u.search;
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path === "/playlists" && method === "GET") return Response.json(playlists);
    if (path === "/playlists" && method === "POST") {
      playlists.push({ id: 9, ...body });
      return Response.json({});
    }
    if (/^\/playlist\/\d+$/.test(path) && method === "DELETE") {
      playlists = playlists.filter((p) => p.id !== Number(path.split("/")[2]));
      return Response.json({});
    }
    return Response.json({});
  }) as unknown as typeof fetch;
  return { f, calls };
}

const mp3 = (name = "tema.mp3", size = 2000) => new File([new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, ...new Array(size).fill(1)])], name, { type: "audio/mpeg" });
const jsonReq = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "content-length": String(JSON.stringify(body).length), ...headers }, body: JSON.stringify(body) });

beforeAll(async () => {
  h = await makeDb();
  locutor = await mk("locutor", "loc");
  redactor = await mk("redactor", "red");
  admin = await mk("admin", "adm");
  await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "stereo_face", apiKey: "K:S" });
});
afterAll(() => h.close());

describe("nombres y rutas", () => {
  it("rechaza separadores, «..» y nombres vacíos o enormes", () => {
    for (const bad of ["", "   ", "a/b", "..", ".", "a\\b", "x:y", "a*b", "a".repeat(101)]) expect(() => safeName(bad)).toThrow();
    expect(safeName("  Mi   carpeta  ")).toBe("Mi carpeta");
  });
  it("las rutas no salen de la biblioteca ni se anidan sin límite", () => {
    expect(safeDir("")).toBe("");
    expect(safeDir("/a//b/")).toBe("a/b");
    expect(() => safeDir("a/../b")).toThrow();
    expect(() => safeDir("../etc")).toThrow();
    expect(() => safeDir(Array(10).fill("x").join("/"))).toThrow();
  });
});

describe("carpetas y subida", () => {
  it("crea una carpeta dentro de otra", async () => {
    const az = azura();
    expect(await createFolder(h.db, locutor, "Casa", "Techno 2026", az.f)).toEqual({ path: "Casa/Techno 2026" });
    expect(az.calls[0]).toMatchObject({ method: "POST", path: "/files/directory", body: { currentDirectory: "Casa", newDirectory: "Techno 2026" } });
  });

  it("sube un audio válido a la carpeta, en base64, con la extensión real", async () => {
    const az = azura();
    const r = await uploadSong(h.db, locutor, "Casa", mp3("Mi tema?.wav"), az.f); // el nombre miente (.wav): manda el contenido
    expect(r.path).toBe("Casa/Mi tema.mp3");
    const c = az.calls[0];
    expect(c).toMatchObject({ method: "POST", path: "/files", body: { path: "Casa/Mi tema.mp3" } });
    expect(Buffer.from((c.body as { file: string }).file, "base64")[0]).toBe(0x49);
  });

  it("rechaza lo que no es audio, un archivo vacío y una carpeta con «..»", async () => {
    const az = azura();
    await expect(uploadSong(h.db, locutor, "", new File(["hola, no soy un audio"], "x.mp3"), az.f)).rejects.toMatchObject({ code: "library_audio" });
    await expect(uploadSong(h.db, locutor, "", new File([], "x.mp3"), az.f)).rejects.toMatchObject({ code: "library_audio" });
    await expect(uploadSong(h.db, locutor, "../fuera", mp3(), az.f)).rejects.toMatchObject({ code: "library_name" });
    expect(az.calls).toHaveLength(0);
  });
});

describe("acciones por lote", () => {
  it("elimina, mueve y agrega a listas con el formato de AzuraCast", async () => {
    const az = azura();
    await libraryBatch(h.db, locutor, { action: "delete", files: ["a/x.mp3"], dirs: ["b"] }, az.f);
    expect(az.calls[0]).toMatchObject({ method: "PUT", path: "/files/batch", body: { do: "delete", files: ["a/x.mp3"], dirs: ["b"] } });
    await libraryBatch(h.db, locutor, { action: "move", files: ["a/x.mp3", "a/y.mp3"], target: "c" }, az.f);
    expect(az.calls[1].body).toEqual({ do: "move", files: ["a/x.mp3", "a/y.mp3"], dirs: [], currentDirectory: "a", directory: "c" });
    await libraryBatch(h.db, locutor, { action: "playlist", dirs: ["Casa"], playlists: [1] }, az.f);
    expect(az.calls[2].body).toEqual({ do: "playlist", files: [], dirs: ["Casa"], playlists: [1] });
  });

  it("valida: algo elegido, rutas seguras, no mover una carpeta dentro de sí misma, una sola carpeta de origen", async () => {
    const az = azura();
    await expect(libraryBatch(h.db, locutor, { action: "delete" }, az.f)).rejects.toThrow();
    await expect(libraryBatch(h.db, locutor, { action: "delete", files: ["../x"] }, az.f)).rejects.toMatchObject({ code: "library_name" });
    await expect(libraryBatch(h.db, locutor, { action: "move", dirs: ["a"], target: "a/b" }, az.f)).rejects.toMatchObject({ code: "library_path" });
    await expect(libraryBatch(h.db, locutor, { action: "move", files: ["a/x.mp3", "b/y.mp3"], target: "c" }, az.f)).rejects.toMatchObject({ code: "library_path" });
    await expect(libraryBatch(h.db, locutor, { action: "playlist", files: ["a.mp3"] }, az.f)).rejects.toMatchObject({ code: "library_playlist" });
    expect(az.calls).toHaveLength(0);
  });
});

describe("listas del AutoDJ y su programación", () => {
  it("convierte el horario entre la interfaz y AzuraCast (HHMM, días ISO)", () => {
    const items = toAzSchedule([{ days: [5, 1], start: "06:30", end: "09:00" }, { days: [], start: "23:00", end: "01:00" }]);
    expect(items[0]).toEqual({ start_time: 630, end_time: 900, start_date: null, end_date: null, days: [1, 5], loop_once: false });
    expect(items[1].days).toEqual([1, 2, 3, 4, 5, 6, 7]); // sin días = todos
    expect(fromAzSchedule(items)[0]).toEqual({ days: [1, 5], start: "06:30", end: "09:00" });
  });

  it("lista las listas marcando cuáles se editan aquí (solo las de canciones)", async () => {
    const l = await listAutoDjPlaylists(h.db, locutor, azura().f);
    expect(l.find((p) => p.id === 1)).toMatchObject({ editable: true, tracks: 12, schedule: [{ days: [1, 2, 3, 4, 5], start: "06:00", end: "09:00" }] });
    expect(l.find((p) => p.id === 2)?.editable).toBe(false);
  });

  it("crea una lista programada de canciones", async () => {
    const az = azura();
    await saveAutoDjPlaylist(h.db, locutor, { name: "Noches", weight: 5, order: "sequential", schedule: [{ days: [5, 6], start: "22:00", end: "02:00" }] }, az.f);
    expect(az.calls.at(-1)).toMatchObject({
      method: "POST",
      path: "/playlists",
      body: { name: "Noches", type: "default", source: "songs", order: "sequential", weight: 5, is_enabled: true, schedule_items: [{ start_time: 2200, end_time: 200, days: [5, 6] }] },
    });
  });

  it("valida el nombre, el peso, las horas y que inicio y fin no coincidan", async () => {
    const az = azura();
    await expect(saveAutoDjPlaylist(h.db, locutor, { name: "" }, az.f)).rejects.toThrow();
    await expect(saveAutoDjPlaylist(h.db, locutor, { name: "x", weight: 99 }, az.f)).rejects.toThrow();
    await expect(saveAutoDjPlaylist(h.db, locutor, { name: "x", schedule: [{ days: [1], start: "25:00", end: "10:00" }] }, az.f)).rejects.toThrow();
    await expect(saveAutoDjPlaylist(h.db, locutor, { name: "x", schedule: [{ days: [1], start: "10:00", end: "10:00" }] }, az.f)).rejects.toThrow();
    await expect(saveAutoDjPlaylist(h.db, locutor, { name: "x", schedule: [{ days: [9], start: "10:00", end: "11:00" }] }, az.f)).rejects.toThrow();
    expect(az.calls).toHaveLength(0);
  });

  it("no edita ni borra las listas de señal externa, ni una que ya no existe", async () => {
    const az = azura();
    await expect(saveAutoDjPlaylist(h.db, locutor, { id: 2, name: "Señal" }, az.f)).rejects.toMatchObject({ code: "library_playlist" });
    await expect(deleteAutoDjPlaylist(h.db, locutor, 2, az.f)).rejects.toMatchObject({ code: "library_playlist" });
    await expect(deleteAutoDjPlaylist(h.db, locutor, 77, az.f)).rejects.toMatchObject({ code: "playlist_not_found" });
    await deleteAutoDjPlaylist(h.db, locutor, 1, az.f);
    expect(az.calls.at(-1)).toMatchObject({ method: "DELETE", path: "/playlist/1" });
  });
});

describe("permisos y rutas HTTP", () => {
  it("el equipo editorial no toca la biblioteca de la radio", async () => {
    const az = azura();
    await expect(createFolder(h.db, redactor, "", "x", az.f)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(uploadSong(h.db, redactor, "", mp3(), az.f)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(libraryBatch(h.db, redactor, { action: "delete", files: ["a"] }, az.f)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listAutoDjPlaylists(h.db, redactor, az.f)).rejects.toBeInstanceOf(ForbiddenError);
    expect(az.calls).toHaveLength(0);
  });

  it("sin sesión 401, sin permiso 403, origen ajeno 403 y cuerpo inválido 400", async () => {
    resetRateLimits();
    const az = azura();
    expect((await folderHandler(h.db, null, jsonReq({ name: "x" }), az.f)).status).toBe(401);
    expect((await folderHandler(h.db, redactor, jsonReq({ name: "x" }), az.f)).status).toBe(403);
    expect((await folderHandler(h.db, locutor, jsonReq({ name: "x" }, { origin: "https://evil.example" }), az.f)).status).toBe(403);
    expect((await folderHandler(h.db, locutor, jsonReq({ parent: "../x", name: "y" }), az.f)).status).toBe(400);
    expect((await folderHandler(h.db, locutor, jsonReq({ parent: "", name: "Nueva" }), az.f)).status).toBe(201);
    expect((await batchHandler(h.db, locutor, jsonReq({ action: "borrar-todo" }), az.f)).status).toBe(400);
    expect((await autodjListHandler(h.db, locutor, az.f)).status).toBe(200);
    expect((await autodjListHandler(h.db, null, az.f)).status).toBe(401);
    expect((await autodjSaveHandler(h.db, locutor, jsonReq({ name: "Lista" }), az.f)).status).toBe(200);
    expect((await autodjDeleteHandler(h.db, locutor, new Request(`${ORIGIN}/x?id=abc`, { method: "DELETE", headers: { origin: ORIGIN } }), az.f)).status).toBe(400);
  });

  it("la subida comprueba el tamaño declarado antes de leer el cuerpo y acepta un audio válido", async () => {
    resetRateLimits();
    const az = azura();
    const big = new Request(`${ORIGIN}/u`, { method: "POST", headers: { origin: ORIGIN, "content-length": String(200 * 1024 * 1024) }, body: "x" });
    expect((await uploadHandler(h.db, locutor, big, az.f)).status).toBe(413);
    const form = new FormData();
    form.set("file", mp3());
    form.set("dir", "Casa");
    const req = new Request(`${ORIGIN}/u`, { method: "POST", headers: { origin: ORIGIN }, body: form });
    const len = String((await new Request(`${ORIGIN}/u`, { method: "POST", body: form }).arrayBuffer()).byteLength);
    const ok = new Request(`${ORIGIN}/u`, { method: "POST", headers: { origin: ORIGIN, "content-length": len }, body: req.body, duplex: "half" } as RequestInit);
    expect((await uploadHandler(h.db, locutor, ok, az.f)).status).toBeLessThan(500);
  });
});
