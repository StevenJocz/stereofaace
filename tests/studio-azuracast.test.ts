import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { AzuraClient } from "@/modules/studio/azuracast";
import { getStudioConfig, loadAzuraClient, saveStudioConfig } from "@/modules/studio/settings";
import { DomainError } from "@/lib/errors";
import { makeDb } from "./helpers";

type Call = { url: string; init?: RequestInit };

function fakeFetch(responses: Record<string, unknown>, status = 200) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    const key = Object.keys(responses).find((k) => u.includes(k));
    return new Response(JSON.stringify(key ? responses[key] : []), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { impl, calls };
}

const cfg = { baseUrl: "https://radio.example.org", stationId: "stereo_face", apiKey: "ID:SECRET" };
const media = (id: number, title: string, artist = "Artista", length = 180.5) => ({
  id,
  path: `carpeta/${title}.mp3`,
  title,
  artist,
  length,
  playlists: [{ id: 2, name: "Creative Commons" }],
});

describe("AzuraClient", () => {
  it("listFolders pide files/list con la clave y separa carpetas de archivos", async () => {
    const { impl, calls } = fakeFetch({
      "/files/list": [
        { path: "yarn013", path_short: "yarn013", text: "yarn013", type: "directory", media: null },
        { path: "x/a.mp3", path_short: "a.mp3", text: "a.mp3", type: "media", media: media(7, "Tema A") },
        { path: "x/cover.jpg", path_short: "cover.jpg", text: "cover.jpg", type: "cover_art", media: null },
      ],
    });
    const r = await new AzuraClient(cfg, impl).listFolders("x");
    expect(calls[0].url).toBe("https://radio.example.org/api/station/stereo_face/files/list?currentDirectory=x");
    expect((calls[0].init?.headers as Record<string, string>)["X-API-Key"]).toBe("ID:SECRET");
    expect(r.folders).toEqual([{ path: "yarn013", name: "yarn013" }]);
    expect(r.files).toEqual([{ id: "7", path: "carpeta/Tema A.mp3", title: "Tema A", artist: "Artista", durationSec: 180.5 }]);
  });

  it("una duración 0 o ausente queda como null", async () => {
    const { impl } = fakeFetch({
      "/files/list": [{ path: "a.mp3", text: "a.mp3", type: "media", media: { ...media(1, "A"), length: 0 } }],
    });
    const r = await new AzuraClient(cfg, impl).listFolders("");
    expect(r.files[0].durationSec).toBeNull();
  });

  it("un 401 lanza un error de dominio legible", async () => {
    const { impl } = fakeFetch({}, 401);
    await expect(new AzuraClient(cfg, impl).listFolders("")).rejects.toMatchObject({
      name: "DomainError",
      code: "azuracast_auth",
      message: "Clave API no válida o sin permisos en AzuraCast.",
    });
  });

  it("listPlaylists devuelve id, nombre y número de pistas", async () => {
    const { impl, calls } = fakeFetch({ "/playlists": [{ id: 2, name: "Creative Commons", num_songs: 27 }, { id: 1, name: "default" }] });
    const r = await new AzuraClient(cfg, impl).listPlaylists();
    expect(calls[0].url).toBe("https://radio.example.org/api/station/stereo_face/playlists");
    expect(r).toEqual([
      { id: 2, name: "Creative Commons", trackCount: 27 },
      { id: 1, name: "default", trackCount: 0 },
    ]);
  });

  it("playlistFiles filtra los archivos que pertenecen a la lista", async () => {
    const { impl } = fakeFetch({
      "/files": [media(1, "En lista"), { ...media(2, "Otra"), playlists: [{ id: 9, name: "x" }] }, { ...media(3, "Sin"), playlists: [] }],
    });
    const r = await new AzuraClient(cfg, impl).playlistFiles(2);
    expect(r.map((f) => f.title)).toEqual(["En lista"]);
  });

  it("fileStream reenvía la cabecera Range y devuelve la respuesta tal cual", async () => {
    const { impl, calls } = fakeFetch({ "/file/7/play": {} });
    const res = await new AzuraClient(cfg, impl).fileStream("7", "bytes=0-99");
    expect(calls[0].url).toBe("https://radio.example.org/api/station/stereo_face/file/7/play");
    expect((calls[0].init?.headers as Record<string, string>).Range).toBe("bytes=0-99");
    expect(res.status).toBe(200);
  });

  it("fileStream rechaza ids que no son numéricos", async () => {
    const { impl } = fakeFetch({});
    await expect(new AzuraClient(cfg, impl).fileStream("../x", null)).rejects.toThrow(DomainError);
  });
});

describe("ajustes del estudio", () => {
  let h: DbHandle;
  let admin: Actor;
  let editor: Actor;
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };

  beforeAll(async () => {
    h = await makeDb();
    admin = await mk("admin", "adm");
    editor = await mk("editor", "ed");
  });
  afterAll(async () => {
    await h.close();
  });

  it("sin configuración devuelve los valores por defecto y sin clave", async () => {
    expect(await getStudioConfig(h.db, admin)).toEqual({
      baseUrl: "https://radio.stereoface.online",
      stationId: "stereo_face",
      hasKey: false,
    });
  });

  it("guardar y leer nunca devuelve la clave", async () => {
    await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "otra_estacion", apiKey: "K:S" });
    const c = await getStudioConfig(h.db, admin);
    expect(c).toEqual({ baseUrl: "https://radio.example.org", stationId: "otra_estacion", hasKey: true });
    expect(JSON.stringify(c)).not.toContain("K:S");
  });

  it("una clave vacía conserva la guardada", async () => {
    await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "otra_estacion", apiKey: "" });
    expect((await getStudioConfig(h.db, admin)).hasKey).toBe(true);
    const client = await loadAzuraClient(h.db, admin);
    expect(client).toBeInstanceOf(AzuraClient);
  });

  it("rechaza http:// y hosts internos", async () => {
    await expect(saveStudioConfig(h.db, admin, { baseUrl: "http://radio.example.org", stationId: "x_y" })).rejects.toBeInstanceOf(ZodError);
    await expect(saveStudioConfig(h.db, admin, { baseUrl: "https://192.168.0.10", stationId: "x_y" })).rejects.toBeInstanceOf(ZodError);
  });

  it("un editor no puede ver ni cambiar los ajustes", async () => {
    await expect(getStudioConfig(h.db, editor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveStudioConfig(h.db, editor, { baseUrl: "https://radio.example.org", stationId: "x_y" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("sin clave guardada, loadAzuraClient avisa con un error de dominio", async () => {
    const h2 = await makeDb();
    const [u] = await h2.db.insert(users).values({ email: "a2@example.com", name: "a2", role: "admin" }).returning();
    await expect(loadAzuraClient(h2.db, { id: u.id, role: u.role })).rejects.toMatchObject({ code: "studio_no_key" });
    await h2.close();
  });
});
