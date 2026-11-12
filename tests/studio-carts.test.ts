import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { auditLogs, users } from "@/db/schema";
import { createCart, deleteCart, listCarts, moveCart, readCartAudio, updateCart } from "@/modules/studio/carts";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let redactor: Actor;
let root: string;

const wav = (extra = 8) => new File([new Uint8Array([...[..."RIFF"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...[..."WAVE"].map((c) => c.charCodeAt(0)), ...Array(extra).fill(1)])], "tono.wav", { type: "audio/wav" });
const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])], "falso.mp3", { type: "audio/mpeg" });
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  editor = await mk("editor", "ed");
  redactor = await mk("redactor", "red");
  root = await mkdtemp(path.join(tmpdir(), "sf-carts-"));
});
afterAll(async () => {
  await h.close();
  await rm(root, { recursive: true, force: true });
});

describe("carts", () => {
  it("crea un cart: guarda el archivo bajo una clave UUID y devuelve la vista", async () => {
    const c = await createCart(h.db, editor, root, { name: "ID de la radio", kind: "id", hotkey: "1", gainDb: -3, duck: true, durationSec: 4.5 }, wav());
    expect(c).toMatchObject({ name: "ID de la radio", kind: "id", hotkey: "1", gainDb: -3, duck: true, durationSec: 4.5, color: "#c6ff00" });
    const files = await readdir(root);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(c)).not.toContain(files[0]); // la clave de almacenamiento no sale en la vista
    const audio = await readCartAudio(h.db, editor, root, c.id);
    expect(audio?.mime).toBe("audio/wav");
    expect(audio?.bytes.length).toBeGreaterThan(8);
  });

  it("rechaza un tipo de cart inexistente, un atajo de 2 caracteres y un color mal formado", async () => {
    await expect(createCart(h.db, editor, root, { name: "x", kind: "otro" as never }, wav())).rejects.toBeInstanceOf(ZodError);
    await expect(createCart(h.db, editor, root, { name: "x", kind: "jingle", hotkey: "ab" }, wav())).rejects.toBeInstanceOf(ZodError);
    await expect(createCart(h.db, editor, root, { name: "x", kind: "jingle", color: "rojo" }, wav())).rejects.toBeInstanceOf(ZodError);
  });

  it("rechaza por contenido un PNG renombrado a .mp3 y no deja archivos huérfanos", async () => {
    const before = (await readdir(root)).length;
    await expect(createCart(h.db, editor, root, { name: "falso", kind: "jingle" }, png())).rejects.toBeInstanceOf(DomainError);
    expect((await readdir(root)).length).toBe(before);
  });

  it("un atajo duplicado entre carts activos se rechaza (sin distinguir mayúsculas)", async () => {
    await expect(createCart(h.db, editor, root, { name: "otro", kind: "jingle", hotkey: "1" }, wav())).rejects.toMatchObject({ code: "cart_hotkey_taken" });
    await createCart(h.db, editor, root, { name: "con q", kind: "jingle", hotkey: "q" }, wav());
    await expect(createCart(h.db, editor, root, { name: "con Q", kind: "jingle", hotkey: "Q" }, wav())).rejects.toMatchObject({ code: "cart_hotkey_taken" });
  });

  it("un redactor no puede crear (403) pero un editor sí", async () => {
    await expect(createCart(h.db, redactor, root, { name: "x", kind: "jingle" }, wav())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCarts(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("listCarts ordena por posición y moveCart intercambia con el vecino", async () => {
    const a = await createCart(h.db, admin, root, { name: "Promo A", kind: "promo" }, wav());
    const b = await createCart(h.db, admin, root, { name: "Promo B", kind: "promo" }, wav());
    let names = (await listCarts(h.db, admin)).map((c) => c.name);
    expect(names.indexOf("Promo A")).toBeLessThan(names.indexOf("Promo B"));
    await moveCart(h.db, admin, b.id, "up");
    names = (await listCarts(h.db, admin)).map((c) => c.name);
    expect(names.indexOf("Promo B")).toBeLessThan(names.indexOf("Promo A"));
    await moveCart(h.db, admin, a.id, "down"); // A ya está después de B: bajar de nuevo no rompe si es el último
    expect((await listCarts(h.db, admin)).length).toBeGreaterThan(2);
  });

  it("updateCart cambia nombre, color y ganancia; la ganancia se acota", async () => {
    const [c] = await listCarts(h.db, admin);
    const u = await updateCart(h.db, admin, c.id, { name: "Renombrado", color: "#ff3b3b", gainDb: -6 });
    expect(u).toMatchObject({ name: "Renombrado", color: "#ff3b3b", gainDb: -6 });
    await expect(updateCart(h.db, admin, c.id, { gainDb: 40 })).rejects.toBeInstanceOf(ZodError);
  });

  it("deleteCart lo oculta y su audio deja de servirse; ids mal formados o inexistentes devuelven null", async () => {
    const c = await createCart(h.db, admin, root, { name: "Se borra", kind: "effect" }, wav());
    await deleteCart(h.db, admin, c.id);
    expect((await listCarts(h.db, admin)).some((x) => x.id === c.id)).toBe(false);
    expect(await readCartAudio(h.db, admin, root, c.id)).toBeNull();
    expect(await readCartAudio(h.db, admin, root, "no-es-un-uuid")).toBeNull();
    expect(await readCartAudio(h.db, admin, root, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("deja registro de auditoría sin datos del archivo", async () => {
    const rows = await h.db.select().from(auditLogs);
    const mine = rows.filter((r) => r.action.startsWith("studio.cart"));
    expect(mine.length).toBeGreaterThan(0);
    expect(JSON.stringify(mine)).not.toMatch(/storageKey|storage_key/);
  });
});
