import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { nowHandler, scheduleHandler } from "@/modules/schedule/http";
import { addSlot, saveProgram } from "@/modules/schedule/service";
import { makeDb } from "./helpers";

let h: DbHandle;

beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "a@example.com", name: "a", role: "admin" }).returning();
  const admin: Actor = { id: u.id, role: u.role };
  const id = (await saveProgram(h.db, admin, { name: "Programa X", description: "Prueba" })).id;
  await addSlot(h.db, admin, { programId: id, kind: "weekly", weekday: 1, start: "06:00", end: "10:00" });
});
afterAll(async () => {
  await h.close();
});

describe("API pública de programación", () => {
  it("now devuelve {now: null} sin programa y con caché corta", async () => {
    const r = await nowHandler(h.db, new Date("2026-11-16T19:00:00Z"));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ now: null });
    expect(r.headers.get("cache-control")).toContain("s-maxage=30");
  });

  it("now devuelve el programa vigente", async () => {
    const body = await (await nowHandler(h.db, new Date("2026-11-16T13:00:00Z"))).json();
    expect(body.now.program.name).toBe("Programa X");
  });

  it("schedule con fechas locales (to inclusivo) devuelve los items", async () => {
    const r = await scheduleHandler(h.db, "2026-11-16", "2026-11-16");
    expect(r.status).toBe(200);
    const { items } = await r.json();
    expect(items).toHaveLength(1);
    expect(items[0].startsAt).toBe("2026-11-16T11:00:00.000Z");
  });

  it("parámetros ausentes, mal formados, invertidos o rango excesivo → 400", async () => {
    expect((await scheduleHandler(h.db, null, "2026-11-16")).status).toBe(400);
    expect((await scheduleHandler(h.db, "16/11/2026", "2026-11-17")).status).toBe(400);
    expect((await scheduleHandler(h.db, "2026-11-20", "2026-11-10")).status).toBe(400);
    expect((await scheduleHandler(h.db, "2026-01-01", "2026-12-31")).status).toBe(400);
  });
});
