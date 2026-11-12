import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { cartAudioHandler, cartUploadHandler, cartsListHandler } from "@/modules/studio/cart-http";
import { createCart } from "@/modules/studio/carts";
import { bodyGate } from "@/modules/studio/http";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let redactor: Actor;
let root: string;
let cartId: string;

const bytes = [...[..."RIFF"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...[..."WAVE"].map((c) => c.charCodeAt(0)), 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  redactor = await mk("redactor", "red");
  root = await mkdtemp(path.join(tmpdir(), "sf-cart-http-"));
  const c = await createCart(h.db, admin, root, { name: "Jingle", kind: "jingle" }, new File([new Uint8Array(bytes)], "j.wav", { type: "audio/wav" }));
  cartId = c.id;
});
afterAll(async () => {
  await h.close();
  await rm(root, { recursive: true, force: true });
});

describe("rutas de carts", () => {
  it("sin sesión 401 y redactor 403 en la lista", async () => {
    expect((await cartsListHandler(h.db, null)).status).toBe(401);
    expect((await cartsListHandler(h.db, redactor)).status).toBe(403);
  });

  it("la lista devuelve los carts sin la clave de almacenamiento", async () => {
    const r = await cartsListHandler(h.db, admin);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ id: cartId, name: "Jingle", kind: "jingle" });
    expect(JSON.stringify(body)).not.toMatch(/storage/i);
  });

  it("el audio se sirve completo, con tipo y caché privada", async () => {
    const r = await cartAudioHandler(h.db, admin, root, cartId, null);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/wav");
    expect(r.headers.get("cache-control")).toContain("private");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array(bytes));
  });

  it("con Range responde 206 y content-range", async () => {
    const r = await cartAudioHandler(h.db, admin, root, cartId, "bytes=0-9");
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 0-9/${bytes.length}`);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array(bytes.slice(0, 10)));
  });

  it("un Range fuera de límites responde 416", async () => {
    const r = await cartAudioHandler(h.db, admin, root, cartId, "bytes=500-600");
    expect(r.status).toBe(416);
  });

  it("id malformado 400, inexistente 404, sin sesión 401, redactor 403", async () => {
    expect((await cartAudioHandler(h.db, admin, root, "abc", null)).status).toBe(400);
    expect((await cartAudioHandler(h.db, admin, root, "00000000-0000-4000-8000-000000000000", null)).status).toBe(404);
    expect((await cartAudioHandler(h.db, null, root, cartId, null)).status).toBe(401);
    expect((await cartAudioHandler(h.db, redactor, root, cartId, null)).status).toBe(403);
  });

  const form = (over: Record<string, string | File> = {}) => {
    const f = new FormData();
    f.set("name", "Promo nueva");
    f.set("kind", "promo");
    f.set("hotkey", "p");
    f.set("duck", "on");
    f.set("durationSec", "7.5");
    f.set("file", new File([new Uint8Array(bytes)], "p.wav", { type: "audio/wav" }));
    for (const [k, v] of Object.entries(over)) f.set(k, v);
    return f;
  };

  it("subida correcta responde 201 con la vista del cart", async () => {
    const r = await cartUploadHandler(h.db, admin, root, form());
    expect(r.status).toBe(201);
    expect(await r.json()).toMatchObject({ name: "Promo nueva", kind: "promo", hotkey: "p", duck: true, durationSec: 7.5 });
  });

  it("un PNG renombrado responde 400; atajo repetido 409; tipo inválido 400; sin archivo 400", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])], "x.mp3", { type: "audio/mpeg" });
    expect((await cartUploadHandler(h.db, admin, root, form({ file: png, hotkey: "z" }))).status).toBe(400);
    expect((await cartUploadHandler(h.db, admin, root, form({ name: "otra" }))).status).toBe(409); // «p» ya existe
    expect((await cartUploadHandler(h.db, admin, root, form({ kind: "musica", hotkey: "y" }))).status).toBe(400);
    const f = form({ hotkey: "x" });
    f.delete("file");
    expect((await cartUploadHandler(h.db, admin, root, f)).status).toBe(400);
  });

  it("subir sin sesión 401 y como redactor 403", async () => {
    expect((await cartUploadHandler(h.db, null, root, form({ hotkey: "k" }))).status).toBe(401);
    expect((await cartUploadHandler(h.db, redactor, root, form({ hotkey: "k" }))).status).toBe(403);
  });
});

describe("bodyGate: auth y tamaño antes de leer el cuerpo", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/api/studio/carts", { method: "POST", headers });

  it("sin sesión 401 y sin permiso 403, aunque el cuerpo sea enorme", () => {
    expect(bodyGate(null, req({ "content-length": "1" }), 1000)?.status).toBe(401);
    expect(bodyGate(redactor, req({ "content-length": "1" }), 1000)?.status).toBe(403);
  });

  it("rechaza con 413 un cuerpo declarado más grande que el máximo y con 411 si no declara tamaño", () => {
    expect(bodyGate(admin, req({ "content-length": "1001" }), 1000)?.status).toBe(413);
    expect(bodyGate(admin, req({}), 1000)?.status).toBe(411);
  });

  it("deja pasar un cuerpo dentro del máximo", () => {
    expect(bodyGate(admin, req({ "content-length": "1000" }), 1000)).toBeNull();
  });
});
