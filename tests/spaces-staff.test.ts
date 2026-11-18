import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { spaceProfiles, users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { createSpaceForUser, registerListener, suggestUsername } from "@/modules/spaces/accounts";
import { getMySpace, publishSpace } from "@/modules/spaces/profile";
import { getPublicSpace, listSpaces } from "@/modules/spaces/public";
import { makeDb } from "./helpers";

let h: DbHandle;
const MAIL = { mailer: { configured: false, send: async () => undefined }, siteUrl: "http://localhost:3000" };

const staff = async (role: "locutor" | "editor" | "admin" | "superadmin", name: string, email: string) => {
  const [u] = await h.db.insert(users).values({ email, name, role }).returning();
  return u.id;
};

beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
});
afterAll(() => h.close());

describe("el personal también tiene su Space (misma cuenta)", () => {
  it("locutores, editorial y administración crean su Space sin registrarse otra vez; el usuario del DJ no cambia", async () => {
    for (const [role, name, email] of [["locutor", "Carla DJ", "carla@example.com"], ["editor", "Edi Torial", "edi@example.com"], ["admin", "Ana Admin", "ana@example.com"], ["superadmin", "Steven Jocz", "steven@example.com"]] as const) {
      const id = await staff(role, name, email);
      const username = (await suggestUsername(h.db, name, email)) ;
      expect(await createSpaceForUser(h.db, id, username)).toEqual({ username });
      const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, id));
      expect(p).toMatchObject({ username, displayName: name, status: "draft" });
      expect((await h.db.select().from(users).where(eq(users.id, id)))[0].role).toBe(role); // sigue siendo del equipo
    }
  });
  it("una sola vez por cuenta, con nombre libre y válido", async () => {
    const id = await staff("editor", "Doble Space", "doble@example.com");
    await createSpaceForUser(h.db, id, "doble_space");
    await expect(createSpaceForUser(h.db, id, "otro_nombre")).rejects.toMatchObject({ code: "space_exists" });
    const id2 = await staff("editor", "Choque", "choque@example.com");
    await expect(createSpaceForUser(h.db, id2, "DOBLE_SPACE")).rejects.toMatchObject({ code: "username_taken" });
    await expect(createSpaceForUser(h.db, id2, "admin")).rejects.toThrow(); // reservado
    await expect(createSpaceForUser(h.db, id2, "a")).rejects.toThrow();
    await expect(createSpaceForUser(h.db, "00000000-0000-4000-8000-000000000000", "fantasma")).rejects.toMatchObject({ code: "not_found" });
    const off = await staff("editor", "Desactivado", "off@example.com");
    await h.db.update(users).set({ active: false }).where(eq(users.id, off));
    await expect(createSpaceForUser(h.db, off, "desactivado")).rejects.toMatchObject({ code: "not_found" });
  });
  it("sugiere un nombre libre a partir del nombre o del correo (sin tildes ni símbolos)", async () => {
    expect(await suggestUsername(h.db, "José Ñandú", "jose@example.com")).toBe("jose_nandu");
    expect(await suggestUsername(h.db, "x", "mi.correo+tag@example.com")).toBe("mi_correo_tag");
    const id = await staff("editor", "Repe", "repe@example.com");
    await createSpaceForUser(h.db, id, "repe");
    expect(await suggestUsername(h.db, "Repe", "otra@example.com")).toBe("repe2");
    expect(await suggestUsername(h.db, "Admin", "a@example.com")).toMatch(/^admin2$|^a_?|space/); // reservado: nunca devuelve «admin»
    expect(["admin", "root"]).not.toContain(await suggestUsername(h.db, "Admin", "a@example.com"));
  });
  it("el personal no necesita confirmar el correo para publicar aunque el correo esté activo; un oyente sí", async () => {
    const id = await staff("locutor", "Loc Publica", "locpub@example.com");
    await createSpaceForUser(h.db, id, "loc_publica");
    expect((await getMySpace(h.db, id)).profile.verified).toBe(true);
    await publishSpace(h.db, id, { requireVerified: true });
    expect((await getPublicSpace(h.db, "loc_publica", null))?.username).toBe("loc_publica");
    const r = await registerListener(h.db, { email: "oyente@example.com", password: "una-clave-larga-123", username: "oyente_x" }, MAIL);
    expect((await getMySpace(h.db, r.userId)).profile.verified).toBe(false);
    await expect(publishSpace(h.db, r.userId, { requireVerified: true })).rejects.toMatchObject({ code: "email_unverified" });
  });
  it("su Space aparece en el listado como el de cualquiera", async () => {
    const res = await listSpaces(h.db, { q: "loc_publica" });
    expect([...res.featured, ...res.recent].map((s) => s.username)).toContain("loc_publica");
  });
});

describe("duración de la sesión de Spaces", () => {
  it("entrar por Spaces mantiene la sesión unos 3 días; el panel sigue en 7; vencida no sirve", async () => {
    const { createSession, getSessionUser, SESSION_DAYS, SPACES_SESSION_DAYS } = await import("@/modules/users/auth");
    const { sessions } = await import("@/db/schema");
    const id = await staff("editor", "Sesion Larga", "sesion@example.com");
    expect(SPACES_SESSION_DAYS).toBe(3);
    const day = 24 * 3600 * 1000;
    const spaces = await createSession(h.db, id, {}, SPACES_SESSION_DAYS);
    const panel = await createSession(h.db, id);
    expect(Math.round((spaces.expiresAt.getTime() - Date.now()) / day)).toBe(3);
    expect(Math.round((panel.expiresAt.getTime() - Date.now()) / day)).toBe(SESSION_DAYS);
    expect((await getSessionUser(h.db, spaces.token))?.id).toBe(id);
    await h.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, id));
    expect(await getSessionUser(h.db, spaces.token)).toBeNull();
  });
});
