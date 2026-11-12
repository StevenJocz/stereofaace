import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { sessions, users } from "@/db/schema";
import { authenticate, createSession } from "@/modules/users/auth";
import { recordAudit } from "@/modules/users/audit";
import {
  createUserAdmin,
  listAudit,
  listUsers,
  resetUserPassword,
  updateUserAdmin,
} from "@/modules/users/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let root: Actor;
let admin: Actor;
let editor: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const input = (over: Record<string, unknown> = {}) => ({
  email: "nuevo@example.com",
  name: "Nuevo",
  role: "editor",
  password: "una-clave-bien-larga",
  ...over,
});

beforeAll(async () => {
  h = await makeDb();
  root = await mkUser("superadmin", "root");
  admin = await mkUser("admin", "adm");
  editor = await mkUser("editor", "ed");
});
afterAll(async () => {
  await h.close();
});

describe("usuarios (administración)", () => {
  it("un admin crea un editor pero no un superadmin; el superadmin crea admins", async () => {
    await createUserAdmin(h.db, admin, input());
    await expect(createUserAdmin(h.db, admin, input({ email: "s@example.com", role: "superadmin" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createUserAdmin(h.db, admin, input({ email: "a@example.com", role: "admin" }))).rejects.toBeInstanceOf(ForbiddenError);
    await createUserAdmin(h.db, root, input({ email: "otro-admin@example.com", role: "admin" }));
  });

  it("valida la contraseña (12+) y no permite correos repetidos sin importar mayúsculas", async () => {
    await expect(createUserAdmin(h.db, root, input({ email: "corta@example.com", password: "12345678901" }))).rejects.toBeInstanceOf(ZodError);
    await expect(createUserAdmin(h.db, root, input({ email: "NUEVO@Example.com" }))).rejects.toMatchObject({ code: "email_taken" });
  });

  it("listUsers nunca expone el hash y un editor solo lee", async () => {
    const list = await listUsers(h.db, editor);
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toMatch(/passwordHash|scrypt\$/);
    await expect(createUserAdmin(h.db, editor, input({ email: "x@example.com" }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no deja al sistema sin superadmin activo, y nadie cambia su propio rol", async () => {
    await expect(updateUserAdmin(h.db, root, root.id, { role: "admin" })).rejects.toMatchObject({ code: "last_superadmin" });
    await expect(updateUserAdmin(h.db, root, root.id, { active: false })).rejects.toMatchObject({ code: "last_superadmin" });

    const second = await mkUser("superadmin", "root2");
    await expect(updateUserAdmin(h.db, root, root.id, { role: "admin" })).rejects.toMatchObject({ code: "self" });
    await updateUserAdmin(h.db, root, second.id, { role: "admin" }); // con dos superadmins sí se puede
    await expect(updateUserAdmin(h.db, root, second.id, { role: "admin" })).resolves.toBeUndefined();
  });

  it("un admin no toca a otro admin ni a un superadmin", async () => {
    const other = await mkUser("admin", "adm2");
    await expect(updateUserAdmin(h.db, admin, other.id, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateUserAdmin(h.db, admin, root.id, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updateUserAdmin(h.db, admin, editor.id, { role: "admin" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateUserAdmin(h.db, admin, editor.id, { name: "Editor renombrado" });
  });

  it("desactivar a alguien cierra sus sesiones", async () => {
    const victim = await mkUser("redactor", "victima");
    await createSession(h.db, victim.id);
    await createSession(h.db, victim.id);
    expect(await h.db.select().from(sessions).where(eq(sessions.userId, victim.id))).toHaveLength(2);
    await updateUserAdmin(h.db, admin, victim.id, { active: false });
    expect(await h.db.select().from(sessions).where(eq(sessions.userId, victim.id))).toHaveLength(0);
  });

  it("restablecer la contraseña cambia el acceso y cierra sesiones", async () => {
    const { id } = await createUserAdmin(h.db, admin, input({ email: "reset@example.com", password: "clave-original-larga" }));
    await createSession(h.db, id);
    await resetUserPassword(h.db, admin, id, "clave-nueva-bien-larga");
    expect(await authenticate(h.db, "reset@example.com", "clave-original-larga")).toBeNull();
    expect(await authenticate(h.db, "reset@example.com", "clave-nueva-bien-larga")).toMatchObject({ id });
    expect(await h.db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
    await expect(resetUserPassword(h.db, admin, id, "corta")).rejects.toBeInstanceOf(ZodError);
  });

  it("la auditoría se filtra por entidad y usuario, y el editor no puede verla", async () => {
    await recordAudit(h.db, { userId: root.id, action: "x.create", entity: "widget", entityId: "1" });
    await recordAudit(h.db, { userId: admin.id, action: "y.create", entity: "gadget", entityId: "2" });
    const byEntity = await listAudit(h.db, admin, { entity: "widget" });
    expect(byEntity.items.map((a) => a.action)).toEqual(["x.create"]);
    expect(byEntity.items[0].userName).toBe("root");
    const byUser = await listAudit(h.db, admin, { userId: admin.id });
    expect(byUser.items.every((a) => a.userName === "adm")).toBe(true);
    await expect(listAudit(h.db, editor, {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(DomainError).toBeTruthy();
  });
});
