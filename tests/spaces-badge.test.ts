import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, can, type Actor } from "@/lib/rbac";

type Role = Actor["role"];
import { users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { registerListener } from "@/modules/spaces/accounts";
import { listSpacesForVerify, listSpacesAdmin, setDisabled, setVerifiedBadge } from "@/modules/spaces/moderation";
import { publishSpace } from "@/modules/spaces/profile";
import { getPublicSpace, listSpaces } from "@/modules/spaces/public";
import { makeDb } from "./helpers";

let h: DbHandle;
const MAIL = { mailer: { configured: false, send: async () => undefined }, siteUrl: "http://localhost:3000" };
const staff: Partial<Record<Role, Actor>> = {};
let target: { id: string; username: string };

beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
  for (const role of ["superadmin", "admin", "editor", "redactor", "colaborador", "locutor"] as const) {
    const [u] = await h.db.insert(users).values({ email: `${role}@example.com`, name: role, role }).returning();
    staff[role] = { id: u.id, role };
  }
  const r = await registerListener(h.db, { email: "ana@example.com", password: "una-clave-larga-123", username: "ana_dj" }, MAIL);
  await publishSpace(h.db, r.userId, { requireVerified: false });
  target = { id: r.userId, username: "ana_dj" };
});
afterAll(() => h.close());

describe("chulo de verificado", () => {
  it("todos los roles por encima de oyente pueden darlo; el oyente no", () => {
    for (const role of ["superadmin", "admin", "editor", "redactor", "colaborador", "locutor"] as const) expect(can(role, "space:verify"), role).toBe(true);
    expect(can("oyente", "space:verify")).toBe(false);
  });

  it("un locutor lo da y lo quita; se ve en el perfil público y en el listado", async () => {
    expect((await getPublicSpace(h.db, target.username, null))!.verifiedBadge).toBe(false);
    await setVerifiedBadge(h.db, staff.locutor!, target.id, true);
    expect((await getPublicSpace(h.db, target.username, null))!.verifiedBadge).toBe(true);
    const list = await listSpaces(h.db, {});
    expect([...list.featured, ...list.recent].find((c) => c.username === target.username)?.verifiedBadge).toBe(true);
    await setVerifiedBadge(h.db, staff.locutor!, target.id, false);
    expect((await getPublicSpace(h.db, target.username, null))!.verifiedBadge).toBe(false);
  });

  it("una persona sin rango (oyente) o sin sesión no puede darlo", async () => {
    const oyente: Actor = { id: target.id, role: "oyente" };
    await expect(setVerifiedBadge(h.db, oyente, target.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setVerifiedBadge(h.db, null, target.id, true)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listSpacesForVerify(h.db, oyente)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("la lista para verificar no trae correos y solo la ve quien tiene el permiso; el equipo sin permiso de moderar no ve la lista completa", async () => {
    const rows = await listSpacesForVerify(h.db, staff.colaborador!, { q: "ana" });
    expect(rows.map((r) => r.username)).toContain("ana_dj");
    expect(JSON.stringify(rows)).not.toContain("example.com");
    await expect(listSpacesAdmin(h.db, staff.colaborador!)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no se da a un Space desactivado ni a uno que no existe; la búsqueda trata % y _ como texto", async () => {
    await expect(setVerifiedBadge(h.db, staff.admin!, "00000000-0000-4000-8000-000000000000", true)).rejects.toMatchObject({ code: "not_found" });
    const r2 = await registerListener(h.db, { email: "beto@example.com", password: "una-clave-larga-123", username: "beto_off" }, MAIL);
    await setDisabled(h.db, staff.admin!, r2.userId, true);
    await expect(setVerifiedBadge(h.db, staff.admin!, r2.userId, true)).rejects.toMatchObject({ code: "not_found" });
    expect(await listSpacesForVerify(h.db, staff.admin!, { q: "%" })).toEqual([]);
  });

  it("el administrador lo ve en la lista completa de Spaces", async () => {
    await setVerifiedBadge(h.db, staff.admin!, target.id, true);
    const l = await listSpacesAdmin(h.db, staff.admin!, { q: "ana_dj" });
    expect(l.rows[0]).toMatchObject({ username: "ana_dj", badge: true });
  });
});
