import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { registerListener } from "@/modules/spaces/accounts";
import { statusHandler } from "@/modules/spaces/http";
import type { SessionUser } from "@/modules/users/auth";
import { makeDb } from "./helpers";

let h: DbHandle;
const MAIL = { mailer: { configured: false, send: async () => undefined }, siteUrl: "http://localhost:3000" };
beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
});
afterAll(() => h.close());

describe("estado de Spaces para el menú del encabezado", () => {
  it("sin sesión: signedIn false, sin datos y sin caché", async () => {
    const r = await statusHandler(h.db, null);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(await r.json()).toEqual({ signedIn: false });
  });
  it("con Space: devuelve su @usuario (sin correo ni datos privados)", async () => {
    const reg = await registerListener(h.db, { email: "ana@example.com", password: "una-clave-larga-123", username: "ana_dj" }, MAIL);
    const me: SessionUser = { id: reg.userId, role: "oyente", email: "ana@example.com", name: "ana_dj" };
    const j = await (await statusHandler(h.db, me)).json();
    expect(j).toEqual({ signedIn: true, hasSpace: true, username: "ana_dj", avatarUrl: null, disabled: false });
    expect(JSON.stringify(j)).not.toContain("example.com");
  });
  it("cuenta del equipo sin Space: signedIn true y hasSpace false", async () => {
    const [u] = await h.db.insert(users).values({ email: "loc@example.com", name: "Loc", role: "locutor" }).returning();
    const j = await (await statusHandler(h.db, { id: u.id, role: "locutor", email: "loc@example.com", name: "Loc" })).json();
    expect(j).toEqual({ signedIn: true, hasSpace: false });
  });
});
