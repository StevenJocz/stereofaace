import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sessions, users } from "@/db/schema";
import { authenticate, createSession, createUser, destroySession, getSessionUser } from "@/modules/users/auth";
import { makeDb } from "./helpers";

let h: DbHandle;
const PASSWORD = "contraseña-de-prueba-123";

beforeAll(async () => {
  h = await makeDb();
});
afterAll(async () => {
  await h.close();
});

describe("contraseñas", () => {
  it("hash y verificación; el hash no contiene la contraseña y es distinto cada vez", async () => {
    const a = await hashPassword(PASSWORD);
    const b = await hashPassword(PASSWORD);
    expect(a).not.toContain(PASSWORD);
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword(PASSWORD, a)).toBe(true);
    expect(await verifyPassword(PASSWORD + "x", a)).toBe(false);
    expect(await verifyPassword(PASSWORD, "basura")).toBe(false);
  });
  it("rechaza contraseñas cortas", async () => {
    await expect(hashPassword("corta")).rejects.toThrow();
  });
});

describe("autenticación y sesiones", () => {
  it("inicia sesión sin distinguir mayúsculas en el correo y rechaza credenciales erróneas", async () => {
    await createUser(h.db, { email: "Equipo@Example.com", name: "Equipo", role: "editor", password: PASSWORD });
    expect((await authenticate(h.db, "equipo@example.com", PASSWORD))?.role).toBe("editor");
    expect(await authenticate(h.db, "equipo@example.com", "otra-contraseña-123")).toBeNull();
    expect(await authenticate(h.db, "nadie@example.com", PASSWORD)).toBeNull();
  });
  it("no permite duplicar el correo", async () => {
    await expect(
      createUser(h.db, { email: "EQUIPO@example.com", name: "x", role: "editor", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "email_taken" });
  });
  it("un usuario desactivado no entra, aunque la contraseña sea correcta", async () => {
    await createUser(h.db, { email: "baja@example.com", name: "Baja", role: "redactor", password: PASSWORD });
    await h.db.update(users).set({ active: false }).where(eq(users.email, "baja@example.com"));
    expect(await authenticate(h.db, "baja@example.com", PASSWORD)).toBeNull();
  });
  it("la sesión se guarda como hash, se valida y se destruye", async () => {
    const u = await authenticate(h.db, "equipo@example.com", PASSWORD);
    const { token } = await createSession(h.db, u!.id);
    const rows = await h.db.select().from(sessions).where(eq(sessions.userId, u!.id));
    expect(rows.some((r) => r.tokenHash === token)).toBe(false);
    expect((await getSessionUser(h.db, token))?.email).toBe("equipo@example.com");
    expect(await getSessionUser(h.db, token + "x")).toBeNull();
    await destroySession(h.db, token);
    expect(await getSessionUser(h.db, token)).toBeNull();
  });
  it("una sesión vencida o de un usuario desactivado no sirve", async () => {
    const u = await authenticate(h.db, "equipo@example.com", PASSWORD);
    const { token } = await createSession(h.db, u!.id);
    await h.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, u!.id));
    expect(await getSessionUser(h.db, token)).toBeNull();

    const { token: t2 } = await createSession(h.db, u!.id);
    await h.db.update(users).set({ active: false }).where(eq(users.id, u!.id));
    expect(await getSessionUser(h.db, t2)).toBeNull();
  });
});
