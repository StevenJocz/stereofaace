import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { auditLogs, media, users } from "@/db/schema";
import { addSlot, deleteProgram, listProgramsAdmin, listSlotsAdmin, removeSlot, saveProgram } from "@/modules/schedule/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let redactor: Actor;
let photoId: string;

const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  editor = await mk("editor", "ed");
  redactor = await mk("redactor", "red");
  const [m] = await h.db.insert(media).values({ storageKey: "11111111-1111-4111-8111-111111111111", mime: "image/jpeg", bytes: 10, width: 1, height: 1, alt: "x" }).returning();
  photoId = m.id;
});
afterAll(async () => {
  await h.close();
});

describe("programas", () => {
  it("crea un programa con slug único y lo lista (con el usuario del DJ para el admin)", async () => {
    const a = await saveProgram(h.db, editor, { name: "Mi Programa", description: "Breve", hosts: "Ana y Luis", djUsername: "dj1", photoId, color: "#9b6bff" });
    const b = await saveProgram(h.db, editor, { name: "Mi Programa" });
    expect(a.slug).toBe("mi-programa");
    expect(b.slug).toBe("mi-programa-2");
    const list = await listProgramsAdmin(h.db, editor);
    expect(list.find((p) => p.id === a.id)).toMatchObject({ name: "Mi Programa", description: "Breve", hosts: "Ana y Luis", djUsername: "dj1", color: "#9b6bff", active: true, slots: 0 });
  });

  it("valida nombre, descripción (300), color, usuario del DJ y foto existente", async () => {
    await expect(saveProgram(h.db, editor, { name: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(saveProgram(h.db, editor, { name: "x", description: "d".repeat(301) })).rejects.toBeInstanceOf(ZodError);
    await expect(saveProgram(h.db, editor, { name: "x", color: "azul" })).rejects.toBeInstanceOf(ZodError);
    await expect(saveProgram(h.db, editor, { name: "x", djUsername: "../dj" })).rejects.toBeInstanceOf(ZodError);
    await expect(saveProgram(h.db, editor, { name: "x", photoId: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(DomainError);
  });

  it("editar conserva el slug y actualiza campos", async () => {
    const { id, slug } = await saveProgram(h.db, editor, { name: "Para editar" });
    const r = await saveProgram(h.db, editor, { id, name: "Editado", description: "Nueva", active: false });
    expect(r.slug).toBe(slug);
    expect((await listProgramsAdmin(h.db, editor)).find((p) => p.id === id)).toMatchObject({ name: "Editado", description: "Nueva", active: false });
  });

  it("un redactor no puede ver ni crear (403); borrar exige station:delete (editor no, admin sí)", async () => {
    await expect(saveProgram(h.db, redactor, { name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listProgramsAdmin(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
    const { id } = await saveProgram(h.db, editor, { name: "A borrar" });
    await expect(deleteProgram(h.db, editor, id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteProgram(h.db, admin, id);
    expect((await listProgramsAdmin(h.db, admin)).some((p) => p.id === id)).toBe(false);
  });

  it("deja auditoría sin el usuario del DJ ni datos sensibles", async () => {
    const rows = (await h.db.select().from(auditLogs)).filter((r) => r.action.startsWith("schedule."));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain("dj1");
  });
});

describe("tramos", () => {
  let programId: string;
  beforeAll(async () => {
    programId = (await saveProgram(h.db, editor, { name: "Con tramos" })).id;
  });

  it("agrega un tramo semanal y uno puntual y los lista", async () => {
    const w = await addSlot(h.db, editor, { programId, kind: "weekly", weekday: 1, start: "18:00", end: "20:00" });
    const o = await addSlot(h.db, editor, { programId, kind: "once", date: "2026-12-24", start: "21:00", end: "23:30" });
    const slots = await listSlotsAdmin(h.db, editor);
    expect(slots.find((s) => s.id === w.id)).toMatchObject({ kind: "weekly", weekday: 1, start: "18:00", end: "20:00", date: null });
    expect(slots.find((s) => s.id === o.id)).toMatchObject({ kind: "once", date: "2026-12-24", weekday: null });
    expect((await listProgramsAdmin(h.db, editor)).find((p) => p.id === programId)?.slots).toBe(2);
  });

  it("rechaza horas inválidas, semanal sin día, puntual con día de semana o sin fecha, y inicio igual al fin", async () => {
    const base = { programId, start: "10:00", end: "11:00" };
    await expect(addSlot(h.db, editor, { ...base, kind: "weekly", weekday: 1, start: "25:00" })).rejects.toBeInstanceOf(ZodError);
    await expect(addSlot(h.db, editor, { ...base, kind: "weekly" })).rejects.toBeInstanceOf(ZodError);
    await expect(addSlot(h.db, editor, { ...base, kind: "weekly", weekday: 9 })).rejects.toBeInstanceOf(ZodError);
    await expect(addSlot(h.db, editor, { ...base, kind: "once", weekday: 1, date: "2026-12-01" })).rejects.toBeInstanceOf(ZodError);
    await expect(addSlot(h.db, editor, { ...base, kind: "once" })).rejects.toBeInstanceOf(ZodError);
    await expect(addSlot(h.db, editor, { programId, kind: "weekly", weekday: 1, start: "10:00", end: "10:00" })).rejects.toBeInstanceOf(ZodError);
  });

  it("un programa inexistente da error de dominio y borrar un tramo lo quita", async () => {
    await expect(addSlot(h.db, editor, { programId: "00000000-0000-4000-8000-000000000000", kind: "weekly", weekday: 2, start: "09:00", end: "10:00" })).rejects.toBeInstanceOf(DomainError);
    const s = await addSlot(h.db, editor, { programId, kind: "weekly", weekday: 3, start: "09:00", end: "10:00" });
    await removeSlot(h.db, editor, s.id);
    expect((await listSlotsAdmin(h.db, editor)).some((x) => x.id === s.id)).toBe(false);
  });

  it("borrar el programa oculta también sus tramos", async () => {
    const id = (await saveProgram(h.db, editor, { name: "Se va" })).id;
    const s = await addSlot(h.db, editor, { programId: id, kind: "weekly", weekday: 4, start: "09:00", end: "10:00" });
    await deleteProgram(h.db, admin, id);
    expect((await listSlotsAdmin(h.db, editor)).some((x) => x.id === s.id)).toBe(false);
  });
});
