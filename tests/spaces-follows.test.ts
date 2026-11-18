import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import type { SessionUser } from "@/modules/users/auth";
import { spaceFollows, spaceProfiles, users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { registerListener } from "@/modules/spaces/accounts";
import { MAX_FOLLOWING, follow, followCounts, followingAmong, isFollowing, unfollow } from "@/modules/spaces/follows";
import { followHandler, followsListHandler } from "@/modules/spaces/http";
import { setDisabled } from "@/modules/spaces/moderation";
import { getMySpace, publishSpace, updateProfile } from "@/modules/spaces/profile";
import { getPublicSpace, listFollows } from "@/modules/spaces/public";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: { id: string; role: "admin" };
const ORIGIN = "http://localhost:3000";
const MAIL = { mailer: { configured: false, send: async () => undefined }, siteUrl: ORIGIN };
let n = 0;

async function person(published = true) {
  const username = `persona${++n}`;
  const r = await registerListener(h.db, { email: `${username}@example.com`, password: "una-clave-larga-123", username }, MAIL);
  if (published) await publishSpace(h.db, r.userId, { requireVerified: false });
  const session: SessionUser = { id: r.userId, role: "oyente", email: `${username}@example.com`, name: username };
  return { id: r.userId, username, session };
}
const req = (method: string, body?: unknown, url = `${ORIGIN}/x`, headers: Record<string, string> = {}) =>
  new Request(url, { method, headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
  const [a] = await h.db.insert(users).values({ email: "adm@example.com", name: "adm", role: "admin" }).returning();
  admin = { id: a.id, role: "admin" };
});
afterAll(() => h.close());
beforeEach(() => resetRateLimits());

describe("seguir y dejar de seguir", () => {
  it("seguir suma un seguidor a la otra persona y un «siguiendo» a quien sigue; es idempotente", async () => {
    const ana = await person();
    const beto = await person();
    expect(await followCounts(h.db, beto.id)).toEqual({ followers: 0, following: 0 });
    expect(await follow(h.db, ana.id, beto.username)).toEqual({ followers: 1, following: 0 });
    expect(await follow(h.db, ana.id, beto.username)).toEqual({ followers: 1, following: 0 }); // otra vez: igual
    expect(await followCounts(h.db, ana.id)).toEqual({ followers: 0, following: 1 });
    expect(await isFollowing(h.db, ana.id, beto.id)).toBe(true);
    expect(await isFollowing(h.db, beto.id, ana.id)).toBe(false); // seguir no es recíproco
    expect(await unfollow(h.db, ana.id, beto.username)).toEqual({ followers: 0, following: 0 });
    expect(await unfollow(h.db, ana.id, beto.username)).toEqual({ followers: 0, following: 0 }); // idempotente
    expect(await followCounts(h.db, ana.id)).toEqual({ followers: 0, following: 0 });
  });
  it("no se sigue a sí misma, ni a un Space inexistente, en borrador o desactivado", async () => {
    const ana = await person();
    const borrador = await person(false);
    const apagada = await person();
    await expect(follow(h.db, ana.id, ana.username)).rejects.toMatchObject({ code: "self_follow" });
    await expect(follow(h.db, ana.id, "no_existe")).rejects.toMatchObject({ code: "not_found" });
    await expect(follow(h.db, ana.id, borrador.username)).rejects.toMatchObject({ code: "not_found" });
    await setDisabled(h.db, admin, apagada.id, true);
    await expect(follow(h.db, ana.id, apagada.username)).rejects.toMatchObject({ code: "not_found" });
    await expect(follow(h.db, ana.id, "../etc")).rejects.toMatchObject({ code: "not_found" });
  });
  it("la base impide una autorrelación aunque se intente saltar el servicio", async () => {
    const ana = await person();
    await expect(h.db.insert(spaceFollows).values({ followerId: ana.id, followedId: ana.id })).rejects.toThrow();
  });
  it("una cuenta con el Space desactivado no puede seguir", async () => {
    const ana = await person();
    const beto = await person();
    await setDisabled(h.db, admin, ana.id, true);
    await expect(follow(h.db, ana.id, beto.username)).rejects.toMatchObject({ code: "space_disabled" });
  });
  it("hay un máximo de cuentas seguidas", async () => {
    const ana = await person();
    const targets = await Promise.all(Array.from({ length: 3 }, () => person()));
    // Simula 500 seguidos con cuentas de relleno.
    const filler = await h.db.insert(users).values(Array.from({ length: MAX_FOLLOWING }, (_, i) => ({ email: `relleno${i}@example.com`, name: `r${i}`, role: "oyente" as const }))).returning({ id: users.id });
    await h.db.insert(spaceFollows).values(filler.map((f) => ({ followerId: ana.id, followedId: f.id })));
    await expect(follow(h.db, ana.id, targets[0].username)).rejects.toMatchObject({ code: "follow_limit" });
    await unfollow(h.db, ana.id, targets[0].username);
  });
});

describe("contadores", () => {
  it("solo cuentan los Spaces públicos: ni desactivados ni borradores, en ninguno de los dos sentidos", async () => {
    const ana = await person();
    const beto = await person();
    const caro = await person();
    await follow(h.db, beto.id, ana.username);
    await follow(h.db, caro.id, ana.username);
    await follow(h.db, ana.id, beto.username);
    expect(await followCounts(h.db, ana.id)).toEqual({ followers: 2, following: 1 });
    await setDisabled(h.db, admin, caro.id, true);
    await setDisabled(h.db, admin, beto.id, true);
    expect(await followCounts(h.db, ana.id)).toEqual({ followers: 0, following: 0 });
    // Al reactivarlos vuelven como borrador (no públicos): siguen sin contar hasta que se publiquen otra vez.
    await setDisabled(h.db, admin, caro.id, false);
    await setDisabled(h.db, admin, beto.id, false);
    expect(await followCounts(h.db, ana.id)).toEqual({ followers: 0, following: 0 });
    await publishSpace(h.db, caro.id, { requireVerified: false });
    await publishSpace(h.db, beto.id, { requireVerified: false });
    expect(await followCounts(h.db, ana.id)).toEqual({ followers: 2, following: 1 });
  });
  it("al borrar una cuenta, sus relaciones desaparecen", async () => {
    const ana = await person();
    const beto = await person();
    await follow(h.db, ana.id, beto.username);
    await h.db.delete(users).where(eq(users.id, ana.id));
    expect(await followCounts(h.db, beto.id)).toEqual({ followers: 0, following: 0 });
  });
  it("followingAmong marca a quiénes sigue", async () => {
    const ana = await person();
    const beto = await person();
    const caro = await person();
    await follow(h.db, ana.id, beto.username);
    expect(await followingAmong(h.db, ana.id, [beto.id, caro.id])).toEqual(new Set([beto.id]));
    expect(await followingAmong(h.db, ana.id, [])).toEqual(new Set());
  });
});

describe("en el perfil público", () => {
  it("muestra seguidores y seguidos, y si quien mira ya sigue; el dueño no ve «yo sigo»", async () => {
    const ana = await person();
    const beto = await person();
    await follow(h.db, beto.id, ana.username);
    const asGuest = (await getPublicSpace(h.db, ana.username, null))!;
    expect(asGuest).toMatchObject({ follows: { followers: 1, following: 0 }, viewerFollows: false, viewerSignedIn: false });
    const asBeto = (await getPublicSpace(h.db, ana.username, { id: beto.id }))!;
    expect(asBeto).toMatchObject({ viewerFollows: true, viewerSignedIn: true });
    const asOwner = (await getPublicSpace(h.db, ana.username, { id: ana.id }))!;
    expect(asOwner).toMatchObject({ isOwner: true, viewerFollows: false });
  });
  it("si la persona decide ocultar los números, los visitantes no los ven (ella sí)", async () => {
    const ana = await person();
    const beto = await person();
    await follow(h.db, beto.id, ana.username);
    const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, ana.id));
    await updateProfile(h.db, ana.id, { displayName: "Ana", privacy: { ...p.privacy, showFollows: false } });
    expect((await getPublicSpace(h.db, ana.username, null))!.follows).toBeNull();
    expect((await getPublicSpace(h.db, ana.username, { id: beto.id }))!.follows).toBeNull();
    expect((await getPublicSpace(h.db, ana.username, { id: ana.id }))!.follows).toEqual({ followers: 1, following: 0 });
    expect((await getMySpace(h.db, ana.id)).follows).toEqual({ followers: 1, following: 0 });
  });
  it("un perfil antiguo sin la opción nueva se muestra con los números visibles por defecto", async () => {
    const ana = await person();
    await h.db.update(spaceProfiles).set({ privacy: { listed: true, showLocation: true, showJoined: true, showLinks: true, showFavorites: true } as never }).where(eq(spaceProfiles.userId, ana.id));
    expect((await getPublicSpace(h.db, ana.username, null))!.follows).toEqual({ followers: 0, following: 0 });
  });
});

describe("ruta /api/spaces/follow", () => {
  it("sin sesión 401, origen ajeno 403, y solo con la sesión: nadie sigue «en nombre de» otra persona", async () => {
    const ana = await person();
    const beto = await person();
    const caro = await person();
    expect((await followHandler(h.db, null, req("POST", { username: beto.username }))).status).toBe(401);
    expect((await followHandler(h.db, ana.session, req("POST", { username: beto.username }, undefined, { origin: "https://evil.example" }))).status).toBe(403);
    const ok = await followHandler(h.db, ana.session, req("POST", { username: beto.username, followerId: caro.id }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ following: true, counts: { followers: 1 } });
    expect(await isFollowing(h.db, ana.id, beto.id)).toBe(true);
    expect(await isFollowing(h.db, caro.id, beto.id)).toBe(false); // el followerId inventado se ignora
  });
  it("errores claros: yo mismo 409, inexistente 404, cuerpo inválido 400; dejar de seguir con DELETE", async () => {
    const ana = await person();
    const beto = await person();
    expect((await followHandler(h.db, ana.session, req("POST", { username: ana.username }))).status).toBe(409);
    expect((await followHandler(h.db, ana.session, req("POST", { username: "nadie_existe" }))).status).toBe(404);
    expect((await followHandler(h.db, ana.session, new Request(`${ORIGIN}/x`, { method: "POST", headers: { origin: ORIGIN }, body: "no es json" }))).status).toBe(400);
    await followHandler(h.db, ana.session, req("POST", { username: beto.username }));
    const del = await followHandler(h.db, ana.session, req("DELETE", undefined, `${ORIGIN}/x?username=${beto.username}`));
    expect(await del.json()).toMatchObject({ following: false, counts: { followers: 0 } });
  });
  it("una cuenta sin Space (personal del administrador) recibe un aviso claro", async () => {
    const beto = await person();
    const staff: SessionUser = { id: admin.id, role: "admin", email: "adm@example.com", name: "adm" };
    const res = await followHandler(h.db, staff, req("POST", { username: beto.username }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Crea tu Space/);
  });
  it("hay un límite de acciones por minuto", async () => {
    const ana = await person();
    const beto = await person();
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await followHandler(h.db, ana.session, req("POST", { username: beto.username }))).status);
    expect(codes.slice(0, 30)).not.toContain(429);
    expect(codes[30]).toBe(429);
  });
});

describe("lista de seguidores y seguidos", () => {
  it("muestra quién la sigue y a quién sigue, del más reciente al más antiguo, solo con Spaces públicos", async () => {
    const ana = await person();
    const beto = await person();
    const caro = await person();
    const borrador = await person(false);
    await follow(h.db, beto.id, ana.username);
    await follow(h.db, caro.id, ana.username);
    await follow(h.db, ana.id, beto.username);
    const seg = await listFollows(h.db, { username: ana.username, kind: "followers", viewerId: null });
    expect(seg.items.map((i) => i.username)).toEqual([caro.username, beto.username]);
    expect(seg.total).toBe(2);
    const sig = await listFollows(h.db, { username: ana.username, kind: "following", viewerId: null });
    expect(sig.items.map((i) => i.username)).toEqual([beto.username]);
    expect(JSON.stringify(seg)).not.toContain("example.com");
    // Un borrador que sigue a alguien no aparece ni cuenta: el número coincide con la lista.
    await h.db.insert(spaceFollows).values({ followerId: borrador.id, followedId: ana.id });
    const otra = await listFollows(h.db, { username: ana.username, kind: "followers", viewerId: null });
    expect(otra.items.map((i) => i.username)).not.toContain(borrador.username);
    expect(otra.total).toBe(otra.items.length);
  });
  it("respeta la privacidad: si oculta sus números, solo ella ve sus listas", async () => {
    const ana = await person();
    const beto = await person();
    await follow(h.db, beto.id, ana.username);
    const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, ana.id));
    await updateProfile(h.db, ana.id, { displayName: "Ana", privacy: { ...p.privacy, showFollows: false } });
    await expect(listFollows(h.db, { username: ana.username, kind: "followers", viewerId: null })).rejects.toMatchObject({ code: "private" });
    await expect(listFollows(h.db, { username: ana.username, kind: "followers", viewerId: beto.id })).rejects.toMatchObject({ code: "private" });
    expect((await listFollows(h.db, { username: ana.username, kind: "followers", viewerId: ana.id })).items).toHaveLength(1);
  });
  it("un Space desactivado, en borrador o inexistente no tiene lista pública", async () => {
    const off = await person();
    const draft = await person(false);
    await setDisabled(h.db, admin, off.id, true);
    for (const u of [off.username, draft.username, "no_existe", "../x"]) {
      await expect(listFollows(h.db, { username: u, kind: "followers", viewerId: null })).rejects.toMatchObject({ code: "not_found" });
    }
    expect((await listFollows(h.db, { username: draft.username, kind: "followers", viewerId: draft.id })).items).toEqual([]);
  });
  it("la ruta HTTP valida el tipo y la página y responde 403 si es privada", async () => {
    const ana = await person();
    const ok = await followsListHandler(h.db, null, new Request(`${ORIGIN}/api/spaces/follows?username=${ana.username}&kind=followers`), "9.9.9.9");
    expect(ok.status).toBe(200);
    expect((await followsListHandler(h.db, null, new Request(`${ORIGIN}/x?username=${ana.username}&kind=otro`), "9.9.9.9")).status).toBe(400);
    expect((await followsListHandler(h.db, null, new Request(`${ORIGIN}/x?username=${ana.username}&kind=followers&page=0`), "9.9.9.9")).status).toBe(400);
    const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, ana.id));
    await updateProfile(h.db, ana.id, { displayName: "Ana", privacy: { ...p.privacy, showFollows: false } });
    expect((await followsListHandler(h.db, null, new Request(`${ORIGIN}/x?username=${ana.username}&kind=followers`), "9.9.9.9")).status).toBe(403);
  });
});
