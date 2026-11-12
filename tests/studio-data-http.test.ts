import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { saveStudioConfig } from "@/modules/studio/settings";
import { historyCsvHandler, historyListHandler, historyLogHandler, savedDeleteHandler, savedGetHandler, savedListHandler, savedSaveHandler } from "@/modules/studio/data-http";
import { makeDb } from "./helpers";

let h: DbHandle;
let dj: Actor;
let other: Actor;
let redactor: Actor;
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
const items = [{ azId: "11", title: "Tema uno", artist: "Banda", durationSec: 14 }];

beforeAll(async () => {
  h = await makeDb();
  dj = await mk("editor", "dj");
  other = await mk("editor", "otro");
  redactor = await mk("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("listas guardadas por HTTP", () => {
  it("sin sesión 401, redactor 403", async () => {
    expect((await savedListHandler(h.db, null)).status).toBe(401);
    expect((await savedListHandler(h.db, redactor)).status).toBe(403);
  });

  it("guardar responde 201 con id y recuento de omitidas; listar y leer funcionan", async () => {
    const r = await savedSaveHandler(h.db, dj, { name: "Mi lista", items: [...items, { azId: "x", title: "mal", artist: "", durationSec: null }] });
    expect(r.status).toBe(201);
    const { id, skipped } = await r.json();
    expect(skipped).toBe(1);
    const list = await (await savedListHandler(h.db, dj)).json();
    expect(list).toEqual([{ id, name: "Mi lista", count: 1, mine: true }]);
    const one = await (await savedGetHandler(h.db, dj, id)).json();
    expect(one.items).toEqual(items);
  });

  it("get con check verifica en AzuraCast y separa las pistas que ya no existen", async () => {
    const admin = await mk("admin", "adm-check");
    await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "stereo_face", apiKey: "K:S" });
    const { id } = await (await savedSaveHandler(h.db, dj, { name: "Con perdidas", items: [items[0], { azId: "99", title: "Borrada", artist: "X", durationSec: 5 }] })).json();
    const fetchImpl = (async () => new Response(JSON.stringify([{ id: 11, path: "a.mp3", title: "Tema uno", artist: "Banda", length: 14, playlists: [] }]), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    const r = await savedGetHandler(h.db, dj, id, { check: true, fetchImpl });
    const body = await r.json();
    expect(body.items.map((i: { azId: string }) => i.azId)).toEqual(["11"]);
    expect(body.missing).toEqual([{ azId: "99", title: "Borrada", artist: "X", durationSec: 5 }]);
  });

  it("get con check sin clave de AzuraCast no falla: devuelve todo y missing null", async () => {
    const h2 = await makeDb();
    const [u] = await h2.db.insert(users).values({ email: "d@example.com", name: "d", role: "editor" }).returning();
    const a = { id: u.id, role: u.role };
    const { id } = await (await savedSaveHandler(h2.db, a, { name: "Sin clave", items })).json();
    const body = await (await savedGetHandler(h2.db, a, id, { check: true })).json();
    expect(body.items).toHaveLength(1);
    expect(body.missing).toBeNull();
    await h2.close();
  });

  it("otro DJ recibe 403 al leerla o borrarla; cuerpo inválido 400; id inexistente 404", async () => {
    const { id } = await (await savedSaveHandler(h.db, dj, { name: "Solo mía", items })).json();
    expect((await savedGetHandler(h.db, other, id)).status).toBe(403);
    expect((await savedDeleteHandler(h.db, other, id)).status).toBe(403);
    expect((await savedSaveHandler(h.db, dj, { name: "", items })).status).toBe(400);
    expect((await savedSaveHandler(h.db, dj, "no es un objeto")).status).toBe(400);
    expect((await savedGetHandler(h.db, dj, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await savedDeleteHandler(h.db, dj, id)).status).toBe(200);
  });
});

describe("historial por HTTP", () => {
  it("registra con 201 y lista con la forma pública; sin sesión 401", async () => {
    expect((await historyLogHandler(h.db, null, { title: "x", source: "local" })).status).toBe(401);
    expect((await historyLogHandler(h.db, dj, { title: "Tema uno", artist: "Banda", source: "azuracast", djName: "DJ 1" })).status).toBe(201);
    const rows = await (await historyListHandler(h.db, dj, { limit: "10", before: null })).json();
    expect(rows[0]).toMatchObject({ title: "Tema uno", djName: "DJ 1" });
  });

  it("cuerpo inválido 400; limit no numérico se ignora; before inválido 400", async () => {
    expect((await historyLogHandler(h.db, dj, { title: "", source: "local" })).status).toBe(400);
    expect((await historyListHandler(h.db, dj, { limit: "abc", before: null })).status).toBe(200);
    expect((await historyListHandler(h.db, dj, { limit: null, before: "ayer" })).status).toBe(400);
  });

  it("el CSV neutraliza fórmulas y lleva cabecera", async () => {
    await historyLogHandler(h.db, dj, { title: "=SUMA(1+1)", artist: "@hack", source: "local" });
    const r = await historyCsvHandler(h.db, dj);
    expect(r.headers.get("content-type")).toContain("text/csv");
    const csv = await r.text();
    expect(csv.split("\n")[0]).toBe("fecha,titulo,artista,origen,dj");
    expect(csv).toContain("'=SUMA(1+1)");
    expect(csv).toContain("'@hack");
  });
});
