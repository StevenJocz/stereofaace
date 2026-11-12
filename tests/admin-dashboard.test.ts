import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { getDashboardStats } from "@/modules/dashboard/service";
import { recordAudit } from "@/modules/users/audit";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let colaborador: Actor;
let redactor: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}

beforeAll(async () => {
  h = await makeDb({ seed: true });
  admin = await mkUser("superadmin", "root");
  colaborador = await mkUser("colaborador", "colab");
  redactor = await mkUser("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("getDashboardStats", () => {
  it("devuelve cifras reales de la base", async () => {
    await recordAudit(h.db, { userId: admin.id, action: "x.create", entity: "x" });
    const s = await getDashboardStats(h.db, admin);
    expect(s.artists).toBeGreaterThan(0);
    expect(s.articles.published).toBeGreaterThan(0);
    expect(s.stations.total).toBeGreaterThan(0);
    expect(s.recentAudit[0]).toMatchObject({ action: "x.create", userName: "root" });
  });

  it("un colaborador no puede ver el panel", async () => {
    await expect(getDashboardStats(h.db, colaborador)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("quien ve el panel pero no la auditoría (redactor) no recibe los últimos cambios", async () => {
    await recordAudit(h.db, { userId: admin.id, action: "user.password_reset", entity: "user" });
    const s = await getDashboardStats(h.db, redactor);
    expect(s.articles.published).toBeGreaterThan(0);
    expect(s.recentAudit).toEqual([]);
  });
});
