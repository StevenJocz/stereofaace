import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { getProgramForDj } from "@/modules/schedule/dj";
import { addSlot, saveProgram } from "@/modules/schedule/service";
import { djProgramHandler } from "@/modules/schedule/dj-http";
import { nowHandler } from "@/modules/schedule/http";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let redactor: Actor;
let dj1Prog: string;
let dj2Prog: string;

beforeAll(async () => {
  h = await makeDb();
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };
  admin = await mk("admin", "adm");
  redactor = await mk("redactor", "red");
  dj1Prog = (await saveProgram(h.db, admin, { name: "Electronic Selection", description: "House y techno", hosts: "Ana", djUsername: "dj1" })).id;
  dj2Prog = (await saveProgram(h.db, admin, { name: "Indie Mornings", djUsername: "dj2" })).id;
  // Lunes 2026-11-16 (Bogotá): dj1 de 18:00 a 20:00, dj2 de 06:00 a 10:00
  await addSlot(h.db, admin, { programId: dj1Prog, kind: "weekly", weekday: 1, start: "18:00", end: "20:00" });
  await addSlot(h.db, admin, { programId: dj2Prog, kind: "weekly", weekday: 1, start: "06:00", end: "10:00" });
});
afterAll(async () => {
  await h.close();
});

describe("getProgramForDj", () => {
  it("devuelve el programa del DJ cuyo tramo cubre ahora", async () => {
    const r = await getProgramForDj(h.db, admin, "dj1", new Date("2026-11-16T23:30:00Z")); // 18:30 Bogotá
    expect(r.scheduled?.program).toMatchObject({ id: dj1Prog, name: "Electronic Selection", description: "House y techno", hosts: "Ana" });
    expect(r.scheduled?.endsAt).toBe("2026-11-17T01:00:00.000Z");
  });

  it("10 minutos antes de empezar ya es «su» programa (ventana de 15 min)", async () => {
    const r = await getProgramForDj(h.db, admin, "dj1", new Date("2026-11-16T22:50:00Z")); // 17:50
    expect(r.scheduled?.program.id).toBe(dj1Prog);
  });

  it("fuera de horario: scheduled null y next trae su próxima ocurrencia", async () => {
    const r = await getProgramForDj(h.db, admin, "dj1", new Date("2026-11-16T15:00:00Z")); // 10:00 Bogotá
    expect(r.scheduled).toBeNull();
    expect(r.next?.program.id).toBe(dj1Prog);
    expect(r.next?.startsAt).toBe("2026-11-16T23:00:00.000Z");
  });

  it("el programa de otro DJ no es su scheduled, pero sí aparece en others", async () => {
    const r = await getProgramForDj(h.db, admin, "dj1", new Date("2026-11-16T12:00:00Z")); // 07:00: toca dj2
    expect(r.scheduled).toBeNull();
    expect(r.others.map((p) => p.id)).toContain(dj2Prog);
  });

  it("el usuario se compara sin distinguir mayúsculas y uno desconocido no tiene programa", async () => {
    expect((await getProgramForDj(h.db, admin, "DJ1", new Date("2026-11-16T23:30:00Z"))).scheduled?.program.id).toBe(dj1Prog);
    const r = await getProgramForDj(h.db, admin, "nadie", new Date("2026-11-16T23:30:00Z"));
    expect(r.scheduled).toBeNull();
    expect(r.next).toBeNull();
  });

  it("usuario con caracteres no válidos → error de dominio; sin permiso → 403", async () => {
    await expect(getProgramForDj(h.db, admin, "../x")).rejects.toBeInstanceOf(DomainError);
    await expect(getProgramForDj(h.db, redactor, "dj1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("la API pública no revela el usuario del DJ", async () => {
    const body = await (await nowHandler(h.db, new Date("2026-11-16T23:30:00Z"))).text();
    expect(body).toContain("Electronic Selection");
    expect(body).not.toContain("dj1");
  });
});

describe("ruta del programa del DJ", () => {
  it("sin sesión 401, redactor 403, usuario inválido 400 y válido 200 con la forma esperada", async () => {
    expect((await djProgramHandler(h.db, null, "dj1")).status).toBe(401);
    expect((await djProgramHandler(h.db, redactor, "dj1")).status).toBe(403);
    expect((await djProgramHandler(h.db, admin, "../x")).status).toBe(400);
    expect((await djProgramHandler(h.db, admin, null)).status).toBe(400);
    const r = await djProgramHandler(h.db, admin, "dj1", new Date("2026-11-16T23:30:00Z"));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.scheduled.program.name).toBe("Electronic Selection");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});

