import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { media, users } from "@/db/schema";
import { getPublicProgram, listPublicPrograms } from "@/modules/schedule/public";
import { addSlot, saveProgram } from "@/modules/schedule/service";
import { groupWeekly, tapeLabel, whenLabel } from "@/ui/radio/program-format";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
// Lunes 2026-11-16, 08:00 en Bogotá.
const MON_0800 = new Date("2026-11-16T13:00:00Z");

beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "adm@example.com", name: "adm", role: "admin" }).returning();
  admin = { id: u.id, role: u.role };
  const [m] = await h.db.insert(media).values({ storageKey: "33333333-3333-4333-8333-333333333333", mime: "image/jpeg", bytes: 10, width: 1, height: 1, alt: "x" }).returning();
  const a = await saveProgram(h.db, admin, { name: "Indie Mornings", description: "Café y guitarras", hosts: "Ana y Luis", djUsername: "dj-secreto", photoId: m.id, color: "#ff7a3b" });
  const b = await saveProgram(h.db, admin, { name: "Underground Nights", hosts: "Mara" });
  const c = await saveProgram(h.db, admin, { name: "Sin horario" });
  const off = await saveProgram(h.db, admin, { name: "Apagado", active: false });
  await addSlot(h.db, admin, { programId: a.id, kind: "weekly", weekday: 1, start: "06:00", end: "10:00" });
  await addSlot(h.db, admin, { programId: a.id, kind: "weekly", weekday: 3, start: "06:00", end: "10:00" });
  await addSlot(h.db, admin, { programId: a.id, kind: "weekly", weekday: 5, start: "07:00", end: "09:00" });
  await addSlot(h.db, admin, { programId: b.id, kind: "weekly", weekday: 1, start: "20:00", end: "23:59" });
  await addSlot(h.db, admin, { programId: off.id, kind: "weekly", weekday: 1, start: "12:00", end: "13:00" });
  void c;
});
afterAll(() => h.close());

describe("programas públicos", () => {
  it("la ficha lleva nombre, quién lo hace, descripción, imagen y color, y nunca el usuario del DJ", async () => {
    const list = await listPublicPrograms(h.db, MON_0800);
    const p = list.find((x) => x.slug === "indie-mornings")!;
    expect(p).toMatchObject({ name: "Indie Mornings", hosts: "Ana y Luis", description: "Café y guitarras", color: "#ff7a3b", imageUrl: "/media/33333333-3333-4333-8333-333333333333" });
    expect(JSON.stringify(list)).not.toContain("dj-secreto");
    expect(Object.keys(p)).not.toContain("djUsername");
  });

  it("solo los activos; primero el que está al aire, luego por próxima emisión y al final los sin horario", async () => {
    const list = await listPublicPrograms(h.db, MON_0800);
    expect(list.map((p) => p.name)).toEqual(["Indie Mornings", "Underground Nights", "Sin horario"]);
    expect(list.map((p) => p.onAir)).toEqual([true, false, false]);
  });

  it("horario semanal (lunes primero) y próximas emisiones", async () => {
    const p = (await getPublicProgram(h.db, "indie-mornings", MON_0800))!;
    expect(p.weekly).toEqual([
      { weekday: 1, start: "06:00", end: "10:00" },
      { weekday: 3, start: "06:00", end: "10:00" },
      { weekday: 5, start: "07:00", end: "09:00" },
    ]);
    expect(p.upcoming.length).toBeGreaterThan(0);
    expect(p.upcoming.length).toBeLessThanOrEqual(4);
    expect(p.upcoming[0].startsAt).toBe("2026-11-16T11:00:00.000Z"); // la emisión en curso
  });

  it("un programa inexistente o apagado no tiene ficha", async () => {
    expect(await getPublicProgram(h.db, "no-existe", MON_0800)).toBeNull();
    expect(await getPublicProgram(h.db, "apagado", MON_0800)).toBeNull();
  });
});

describe("formato de horarios", () => {
  it("agrupa los días con la misma hora", () => {
    expect(
      groupWeekly([
        { weekday: 1, start: "06:00", end: "10:00" },
        { weekday: 3, start: "06:00", end: "10:00" },
        { weekday: 5, start: "07:00", end: "09:00" },
      ]),
    ).toEqual([
      { days: ["LUN", "MIÉ"], start: "06:00", end: "10:00" },
      { days: ["VIE"], start: "07:00", end: "09:00" },
    ]);
  });
  it("«hoy», «mañana» y fecha corta, en hora de Bogotá", () => {
    expect(whenLabel("2026-11-17T01:00:00.000Z", MON_0800)).toBe("Hoy 20:00"); // lunes 20:00 Bogotá
    expect(whenLabel("2026-11-17T11:00:00.000Z", MON_0800)).toBe("Mañana 06:00");
    expect(whenLabel("2026-11-19T11:00:00.000Z", MON_0800)).toBe("jue 19 · 06:00");
  });
  it("la cinta dice «Al aire» o la próxima emisión, y nada si no hay horario", () => {
    expect(tapeLabel({ onAir: true, upcoming: [] }, MON_0800)).toBe("Al aire");
    expect(tapeLabel({ onAir: false, upcoming: [{ startsAt: "2026-11-17T01:00:00.000Z", endsAt: "2026-11-17T04:59:00.000Z" }] }, MON_0800)).toBe("Próximo · Hoy 20:00");
    expect(tapeLabel({ onAir: false, upcoming: [] }, MON_0800)).toBeNull();
  });
});
