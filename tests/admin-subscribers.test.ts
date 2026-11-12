import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { subscribers, users } from "@/db/schema";
import { csvCell } from "@/lib/csv";
import {
  deleteSubscriber,
  exportSubscribersCsv,
  listSubscribers,
  setSubscriberStatus,
} from "@/modules/settings/subscribers-admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let ids: Record<string, string>;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}

beforeAll(async () => {
  h = await makeDb();
  admin = await mkUser("admin", "adm");
  editor = await mkUser("editor", "ed");
  const rows = await h.db
    .insert(subscribers)
    .values([
      { email: "ana@example.com", status: "pending" },
      { email: "beto@example.com", status: "confirmed", confirmedAt: new Date("2026-01-01") },
      { email: "=cmd|calc@example.com", status: "pending" },
      { email: "dora@example.com", status: "unsubscribed" },
    ])
    .returning();
  ids = Object.fromEntries(rows.map((r) => [r.email, r.id]));
});
afterAll(async () => {
  await h.close();
});

describe("csvCell", () => {
  it("neutraliza fórmulas de hoja de cálculo", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+34")).toBe("'+34");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@sum")).toBe("'@sum");
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
  });
  it("escapa comillas, comas y saltos de línea", () => {
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("plain")).toBe("plain");
  });
});

describe("suscriptores (administración)", () => {
  it("cuenta por estado y filtra por texto y estado", async () => {
    const all = await listSubscribers(h.db, editor, {});
    expect(all.total).toBe(4);
    expect(all.counts).toEqual({ pending: 2, confirmed: 1, unsubscribed: 1 });
    expect((await listSubscribers(h.db, editor, { status: "confirmed" })).items.map((s) => s.email)).toEqual(["beto@example.com"]);
    expect((await listSubscribers(h.db, editor, { search: "ana@" })).items.map((s) => s.email)).toEqual(["ana@example.com"]);
  });

  it("confirmar fija confirmedAt y darse de baja no lo borra", async () => {
    await setSubscriberStatus(h.db, admin, ids["ana@example.com"], "confirmed");
    const [a] = await h.db.select().from(subscribers).where(eq(subscribers.id, ids["ana@example.com"]));
    expect(a.status).toBe("confirmed");
    expect(a.confirmedAt).toBeInstanceOf(Date);
    await setSubscriberStatus(h.db, admin, ids["ana@example.com"], "unsubscribed");
    const [b] = await h.db.select().from(subscribers).where(eq(subscribers.id, ids["ana@example.com"]));
    expect(b.status).toBe("unsubscribed");
    expect(b.confirmedAt).toBeInstanceOf(Date);
  });

  it("el CSV respeta el filtro, trae cabecera y neutraliza correos que empiezan por =", async () => {
    const csv = await exportSubscribersCsv(h.db, admin, { status: "pending" });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("email,estado,origen,consentimiento,confirmado");
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith("'=cmd|calc@example.com,pending,web,")).toBe(true);
  });

  it("solo quien puede actualizar o borrar lo hace; un editor solo lee y exporta", async () => {
    await expect(setSubscriberStatus(h.db, editor, ids["dora@example.com"], "pending")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteSubscriber(h.db, editor, ids["dora@example.com"])).rejects.toBeInstanceOf(ForbiddenError);
    expect(await exportSubscribersCsv(h.db, editor)).toContain("dora@example.com");
  });

  it("deleteSubscriber elimina el registro y lo audita", async () => {
    await deleteSubscriber(h.db, admin, ids["dora@example.com"]);
    expect((await listSubscribers(h.db, admin, {})).items.map((s) => s.email)).not.toContain("dora@example.com");
  });
});
