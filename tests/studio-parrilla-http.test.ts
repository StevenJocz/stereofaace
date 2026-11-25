import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { parrillaHandler } from "@/modules/studio/data-http";
import { addSlot, saveProgram } from "@/modules/schedule/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let locutor: Actor;

const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  editor = await mk("editor", "ed");
  locutor = await mk("locutor", "loc");
});
afterAll(() => h.close());

describe("GET /api/studio/parrilla", () => {
  it("devuelve los programas y sus horarios a quien gestiona la emisora", async () => {
    const p = await saveProgram(h.db, admin, { name: "Noches Electrónicas", hosts: "DJ Aurora", color: "#9b6bff" });
    await addSlot(h.db, admin, { programId: p.id, kind: "weekly", weekday: 5, start: "22:00", end: "00:00" });
    const res = await parrillaHandler(h.db, editor);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = (await res.json()) as { programs: { id: string; name: string; slots: number }[]; slots: { programId: string; weekday: number; start: string; end: string }[] };
    expect(body.programs.find((x) => x.id === p.id)).toMatchObject({ name: "Noches Electrónicas", slots: 1 });
    expect(body.slots).toEqual([expect.objectContaining({ programId: p.id, weekday: 5, start: "22:00", end: "00:00" })]);
  });

  it("sin sesión 401; un locutor (solo estudio) no gestiona la parrilla: 403", async () => {
    expect((await parrillaHandler(h.db, null)).status).toBe(401);
    expect((await parrillaHandler(h.db, locutor)).status).toBe(403);
  });
});
