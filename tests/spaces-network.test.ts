import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { seedBase } from "@/db/seed-base";
import { registerListener } from "@/modules/spaces/accounts";
import { follow } from "@/modules/spaces/follows";
import { setDisabled } from "@/modules/spaces/moderation";
import { publishSpace, updateProfile } from "@/modules/spaces/profile";
import { getNetwork } from "@/modules/spaces/public";
import { eq } from "drizzle-orm";
import { spaceProfiles, users } from "@/db/schema";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: { id: string; role: "admin" };
const MAIL = { mailer: { configured: false, send: async () => undefined }, siteUrl: "http://localhost:3000" };
let n = 0;

async function person(published = true) {
  const username = `red${++n}`;
  const r = await registerListener(h.db, { email: `${username}@example.com`, password: "una-clave-larga-123", username }, MAIL);
  if (published) await publishSpace(h.db, r.userId, { requireVerified: false });
  return { id: r.userId, username };
}

beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
  const [a] = await h.db.insert(users).values({ email: "adm@example.com", name: "adm", role: "admin" }).returning();
  admin = { id: a.id, role: "admin" };
});
afterAll(() => h.close());

describe("red de la portada", () => {
  it("sin Spaces públicos devuelve una red vacía (no inventa perfiles)", async () => {
    expect(await getNetwork(h.db)).toEqual({ nodes: [], edges: [], total: 0 });
  });

  it("muestra solo Spaces publicados y visibles, y sus seguimientos como conexiones", async () => {
    const ana = await person();
    const beto = await person();
    const borrador = await person(false);
    const apagada = await person();
    await setDisabled(h.db, admin, apagada.id, true);
    await follow(h.db, ana.id, beto.username);
    const net = await getNetwork(h.db);
    expect(net.nodes.map((x) => x.username).sort()).toEqual([ana.username, beto.username].sort());
    expect(net.nodes.find((x) => x.username === borrador.username)).toBeUndefined();
    expect(net.total).toBe(2);
    expect(net.edges).toEqual([{ from: ana.username, to: beto.username }]);
    expect(net.nodes.find((x) => x.username === beto.username)?.followers).toBe(1);
  });

  it("si una persona oculta sus seguidores, la relación no se revela ni se cuentan sus seguidores", async () => {
    const [x, y] = [await person(), await person()];
    await follow(h.db, x.id, y.username);
    const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, y.id));
    await updateProfile(h.db, y.id, { displayName: "Y", privacy: { ...p.privacy, showFollows: false } });
    const net = await getNetwork(h.db);
    expect(net.edges.find((e) => e.to === y.username)).toBeUndefined();
    expect(net.nodes.find((v) => v.username === y.username)?.followers).toBeNull();
  });

  it("si una persona sale del listado, no aparece en la red", async () => {
    const z = await person();
    const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, z.id));
    await updateProfile(h.db, z.id, { displayName: "Z", privacy: { ...p.privacy, listed: false } });
    const net = await getNetwork(h.db);
    expect(net.nodes.find((v) => v.username === z.username)).toBeUndefined();
  });

  it("respeta el límite de nodos", async () => {
    for (let i = 0; i < 12; i++) await person();
    expect((await getNetwork(h.db, 9)).nodes).toHaveLength(9);
    expect((await getNetwork(h.db, 3)).nodes).toHaveLength(3);
  });
});
