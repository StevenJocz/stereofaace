import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { Actor } from "@/lib/rbac";
import { media, users } from "@/db/schema";
import { getNowPlaying, getSchedule } from "@/modules/schedule/public";
import { addSlot, deleteProgram, saveProgram } from "@/modules/schedule/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let progA: string;
let progB: string;

beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "adm@example.com", name: "adm", role: "admin" }).returning();
  admin = { id: u.id, role: u.role };
  const [m] = await h.db.insert(media).values({ storageKey: "22222222-2222-4222-8222-222222222222", mime: "image/jpeg", bytes: 10, width: 1, height: 1, alt: "x" }).returning();
  progA = (await saveProgram(h.db, admin, { name: "Indie Mornings", description: "Café y guitarras", hosts: "Ana", djUsername: "dj1", photoId: m.id, color: "#ff7a3b" })).id;
  progB = (await saveProgram(h.db, admin, { name: "Underground Nights" })).id;
  // Lunes 2026-11-16, hora de Bogotá
  await addSlot(h.db, admin, { programId: progA, kind: "weekly", weekday: 1, start: "06:00", end: "10:00" });
  await addSlot(h.db, admin, { programId: progB, kind: "weekly", weekday: 1, start: "20:00", end: "23:59" });
});
afterAll(async () => {
  await h.close();
});

describe("getNowPlaying", () => {
  it("devuelve el programa vigente, su fin y el siguiente", async () => {
    const r = await getNowPlaying(h.db, new Date("2026-11-16T13:00:00Z")); // 08:00 Bogotá
    expect(r?.program).toMatchObject({ slug: "indie-mornings", name: "Indie Mornings", description: "Café y guitarras", hosts: "Ana", color: "#ff7a3b" });
    expect(r?.program.imageUrl).toMatch(/^\/media\/22222222-2222-4222-8222-222222222222$/);
    expect(r?.endsAt).toBe("2026-11-16T15:00:00.000Z");
    expect(r?.next?.program.slug).toBe("underground-nights");
    expect(r?.next?.startsAt).toBe("2026-11-17T01:00:00.000Z");
  });

  it("fuera de todo tramo devuelve null", async () => {
    expect(await getNowPlaying(h.db, new Date("2026-11-16T19:00:00Z"))).toBeNull(); // 14:00 Bogotá
  });

  it("no expone datos internos (usuario del DJ, ids, fechas de creación)", async () => {
    const r = await getNowPlaying(h.db, new Date("2026-11-16T13:00:00Z"));
    const txt = JSON.stringify(r);
    expect(txt).not.toContain("dj1");
    expect(txt).not.toMatch(/createdAt|updatedAt|djUsername|photoId|"id"/);
  });

  it("un programa desactivado o borrado deja de aparecer", async () => {
    const id = (await saveProgram(h.db, admin, { name: "Temporal" })).id;
    await addSlot(h.db, admin, { programId: id, kind: "once", date: "2026-11-18", start: "10:00", end: "11:00" });
    expect((await getNowPlaying(h.db, new Date("2026-11-18T15:30:00Z")))?.program.slug).toBe("temporal");
    await saveProgram(h.db, admin, { id, name: "Temporal", active: false });
    expect(await getNowPlaying(h.db, new Date("2026-11-18T15:30:00Z"))).toBeNull();
    await saveProgram(h.db, admin, { id, name: "Temporal", active: true });
    await deleteProgram(h.db, admin, id);
    expect(await getNowPlaying(h.db, new Date("2026-11-18T15:30:00Z"))).toBeNull();
  });
});

describe("getSchedule", () => {
  it("lista las ocurrencias de un rango con el programa público", async () => {
    const items = await getSchedule(h.db, new Date("2026-11-16T05:00:00Z"), new Date("2026-11-17T05:00:00Z"));
    expect(items.map((i) => [i.program.slug, i.startsAt])).toEqual([
      ["indie-mornings", "2026-11-16T11:00:00.000Z"],
      ["underground-nights", "2026-11-17T01:00:00.000Z"],
    ]);
  });

  it("rechaza rangos de más de 62 días y fechas invertidas", async () => {
    await expect(getSchedule(h.db, new Date("2026-11-01T00:00:00Z"), new Date("2027-02-01T00:00:00Z"))).rejects.toMatchObject({ code: "range_too_large" });
    await expect(getSchedule(h.db, new Date("2026-11-10T00:00:00Z"), new Date("2026-11-01T00:00:00Z"))).rejects.toBeInstanceOf(DomainError);
  });
});
