import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { listHistory, logPlayed } from "@/modules/studio/history";
import { makeDb } from "./helpers";

let h: DbHandle;
let dj: Actor;
let redactor: Actor;
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
const t0 = new Date("2026-11-12T20:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);

beforeAll(async () => {
  h = await makeDb();
  dj = await mk("editor", "dj");
  redactor = await mk("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("historial de emisión", () => {
  it("registra y lista en orden descendente", async () => {
    await logPlayed(h.db, dj, { title: "Uno", artist: "A", source: "azuracast" }, at(0));
    await logPlayed(h.db, dj, { title: "Dos", artist: "B", source: "local", djName: "DJ 1" }, at(200));
    const rows = await listHistory(h.db, dj);
    expect(rows.map((r) => r.title)).toEqual(["Dos", "Uno"]);
    expect(rows[0]).toMatchObject({ source: "local", djName: "DJ 1", artist: "B" });
    expect(Object.keys(rows[0]).sort()).toEqual(["artist", "djName", "id", "playedAt", "source", "title"]);
  });

  it("la misma pista en menos de 30 s no se duplica; pasados 30 s sí", async () => {
    await logPlayed(h.db, dj, { title: "Repetida", artist: "R", source: "local" }, at(1000));
    await logPlayed(h.db, dj, { title: "Repetida", artist: "R", source: "local" }, at(1010));
    await logPlayed(h.db, dj, { title: "Repetida", artist: "R", source: "local" }, at(1045));
    const rows = (await listHistory(h.db, dj, { limit: 200 })).filter((r) => r.title === "Repetida");
    expect(rows).toHaveLength(2);
  });

  it("recorta títulos largos a 200 caracteres y rechaza título vacío o fuente inválida", async () => {
    await logPlayed(h.db, dj, { title: "t".repeat(300), artist: "x", source: "cart" }, at(2000));
    expect((await listHistory(h.db, dj))[0].title).toHaveLength(200);
    await expect(logPlayed(h.db, dj, { title: "  ", artist: "", source: "local" }, at(2100))).rejects.toBeInstanceOf(ZodError);
    await expect(logPlayed(h.db, dj, { title: "ok", artist: "", source: "radio" as never }, at(2100))).rejects.toBeInstanceOf(ZodError);
  });

  it("el límite por defecto es 50 y el máximo 200", async () => {
    for (let i = 0; i < 60; i++) await logPlayed(h.db, dj, { title: `Bulk ${i}`, artist: "", source: "local" }, at(5000 + i * 60));
    expect(await listHistory(h.db, dj)).toHaveLength(50);
    expect((await listHistory(h.db, dj, { limit: 9999 })).length).toBeLessThanOrEqual(200);
    expect(await listHistory(h.db, dj, { limit: 3 })).toHaveLength(3);
  });

  it("before pagina hacia atrás", async () => {
    const page = await listHistory(h.db, dj, { limit: 2, before: at(5000 + 30 * 60) });
    expect(page).toHaveLength(2);
    expect(new Date(page[0].playedAt).getTime()).toBeLessThan(at(5000 + 30 * 60).getTime());
  });

  it("sin permiso (redactor) responde 403", async () => {
    await expect(logPlayed(h.db, redactor, { title: "x", artist: "", source: "local" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listHistory(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
