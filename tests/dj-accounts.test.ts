import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, can, canAssignRole, type Actor } from "@/lib/rbac";
import { radioPrograms, users } from "@/db/schema";
import { addSlot, saveProgram } from "@/modules/schedule/service";
import { djCredentialsHandler, djProgramHandler } from "@/modules/schedule/dj-http";
import { djPassword, getDjCredentials, scheduleItemsFor, syncDjAccount, uniqueDjUsername } from "@/modules/studio/dj-accounts";
import { saveStudioConfig } from "@/modules/studio/settings";
import { assignPrograms, createUserAdmin, resyncDj, updateUserAdmin } from "@/modules/users/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
const PW = "una-clave-larga-123";

const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

/** AzuraCast simulado: guarda los DJ que se crean o cambian. */
function azura(opts: { timezone?: string | null } = {}) {
  const streamers: { id: number; streamer_username: string; body: Record<string, unknown> }[] = [];
  const calls: string[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push(`${method} ${u.replace("https://radio.example.org", "")}`);
    if (u.endsWith("/api/admin/station/stereo_face")) {
      return opts.timezone === null ? new Response("{}", { status: 403 }) : Response.json({ timezone: opts.timezone ?? "America/Bogota" });
    }
    if (u.endsWith("/streamers") && method === "GET") return Response.json(streamers.map((s) => ({ id: s.id, streamer_username: s.streamer_username })));
    if (u.endsWith("/streamers") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      streamers.push({ id: streamers.length + 1, streamer_username: body.streamer_username, body });
      return Response.json({});
    }
    const m = /\/streamer\/(\d+)$/.exec(u);
    if (m && method === "PUT") {
      const s = streamers.find((x) => x.id === Number(m[1]))!;
      s.body = JSON.parse(String(init?.body));
      return Response.json({});
    }
    return new Response("no", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, streamers, calls };
}

// Miércoles 4 de marzo de 2026, 20:30 en Bogotá.
const WED_2030 = new Date("2026-03-04T20:30:00-05:00");

beforeAll(async () => {
  // Las funciones sin cliente inyectado no deben salir a la red: AzuraCast «no responde».
  vi.stubGlobal("fetch", async () => new Response("caído", { status: 503 }));
  h = await makeDb();
  admin = await mk("admin", "adm");
  await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "stereo_face", apiKey: "K:S" });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await h.close();
});

describe("rol locutor", () => {
  it("solo usa el estudio: nada de contenido, ajustes ni programación", () => {
    expect(can("locutor", "studio:update")).toBe(true);
    for (const p of ["article:read", "artist:read", "station:update", "station:read", "setting:read", "user:read"] as const) expect(can("locutor", p)).toBe(false);
  });
  it("editor, redactor y colaborador (la parte editorial) ya no entran al estudio; administrador sí", () => {
    for (const r of ["editor", "redactor", "colaborador"] as const) expect(can(r, "studio:update")).toBe(false);
    expect(can("admin", "studio:update")).toBe(true);
    expect(can("superadmin", "studio:update")).toBe(true);
  });
  it("el administrador puede crear locutores; el locutor no crea a nadie", () => {
    expect(canAssignRole({ id: "x", role: "admin" }, "locutor")).toBe(true);
    expect(can("locutor", "user:create")).toBe(false);
  });
});

describe("usuario y clave del DJ", () => {
  it("el usuario sale del nombre y es único", async () => {
    await h.db.insert(users).values({ email: "u1@example.com", name: "Ana Pérez", role: "locutor", djUsername: "ana-perez" });
    expect(await uniqueDjUsername(h.db, "Ana Pérez")).toBe("ana-perez2");
    expect(await uniqueDjUsername(h.db, "Luis Gómez")).toBe("luis-gomez");
  });
  it("la clave es larga, siempre la misma para la misma persona y distinta entre personas", async () => {
    const a = await mk("locutor", "pw-a");
    const b = await mk("locutor", "pw-b");
    const p = await djPassword(h.db, a.id);
    expect(p).toHaveLength(32);
    expect(await djPassword(h.db, a.id)).toBe(p);
    expect(await djPassword(h.db, b.id)).not.toBe(p);
  });
});

describe("alta de locutor", () => {
  let prog: string;
  it("sin programa no se crea; con programa queda con su DJ, su programa y su cuenta en AzuraCast con horario", async () => {
    prog = (await saveProgram(h.db, admin, { name: "Noche Electrónica" })).id;
    await addSlot(h.db, admin, { programId: prog, kind: "weekly", weekday: 3, start: "20:00", end: "22:00" });
    await addSlot(h.db, admin, { programId: prog, kind: "weekly", weekday: 0, start: "23:00", end: "01:00" });
    await addSlot(h.db, admin, { programId: prog, kind: "once", date: "2026-03-10", start: "10:00", end: "11:00" });

    await expect(createUserAdmin(h.db, admin, { email: "np@example.com", name: "Sin Programa", role: "locutor", password: PW })).rejects.toMatchObject({ code: "program_required" });

    const az = azura();
    // El alta usa el AzuraCast real configurado; aquí se comprueba el flujo con la sincronización explícita.
    const created = await createUserAdmin(h.db, admin, { email: "dj@example.com", name: "Carla DJ", role: "locutor", password: PW, programId: prog });
    const [u] = await h.db.select().from(users).where(eq(users.id, created.id));
    expect(u).toMatchObject({ role: "locutor", djUsername: "carla-dj" });
    expect((await h.db.select().from(radioPrograms).where(eq(radioPrograms.id, prog)))[0].djUsername).toBe("carla-dj");
    expect(created.dj?.ok).toBe(false); // el AzuraCast de pruebas no existe: el usuario se crea igual y se avisa

    const r = await syncDjAccount(h.db, created.id, az.f);
    expect(r).toEqual({ ok: true });
    expect(az.streamers).toHaveLength(1);
    expect(az.streamers[0].body).toMatchObject({
      streamer_username: "carla-dj",
      display_name: "Carla DJ",
      is_active: true,
      enforce_schedule: true,
      streamer_password: await djPassword(h.db, created.id),
    });
    expect(az.streamers[0].body.schedule_items).toEqual(
      expect.arrayContaining([
        { start_time: 2000, end_time: 2200, start_date: null, end_date: null, days: [3], loop_once: false },
        { start_time: 2300, end_time: 100, start_date: null, end_date: null, days: [7], loop_once: false }, // domingo = 7 en AzuraCast
        { start_time: 1000, end_time: 1100, start_date: "2026-03-10", end_date: "2026-03-10", days: [], loop_once: false },
      ]),
    );
    // Sincronizar otra vez actualiza, no duplica.
    await syncDjAccount(h.db, created.id, az.f);
    expect(az.streamers).toHaveLength(1);
    expect(az.calls.some((c) => c.startsWith("PUT /api/station/stereo_face/streamer/1"))).toBe(true);
  });

  it("una zona horaria distinta de Bogotá no impide guardar, pero avisa", async () => {
    const l = await mk("locutor", "tz");
    await h.db.update(users).set({ djUsername: "tz-dj" }).where(eq(users.id, l.id));
    expect((await syncDjAccount(h.db, l.id, azura({ timezone: "UTC" }).f)).warning).toMatch(/UTC/);
    expect((await syncDjAccount(h.db, l.id, azura({ timezone: null }).f)).warning).toMatch(/zona horaria/);
  });

  it("si AzuraCast falla, no lanza: devuelve el aviso", async () => {
    const l = await mk("locutor", "fall");
    await h.db.update(users).set({ djUsername: "fall-dj" }).where(eq(users.id, l.id));
    const bad = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const r = await syncDjAccount(h.db, l.id, bad);
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/AzuraCast/);
  });

  it("desactivar o cambiar de rol al locutor desactiva su cuenta de DJ", async () => {
    const az = azura();
    const [row] = await h.db.select().from(users).where(eq(users.email, "dj@example.com"));
    await syncDjAccount(h.db, row.id, az.f);
    await h.db.update(users).set({ active: false }).where(eq(users.id, row.id));
    await syncDjAccount(h.db, row.id, az.f);
    expect(az.streamers[0].body.is_active).toBe(false);
    await h.db.update(users).set({ active: true, role: "editor" }).where(eq(users.id, row.id));
    await syncDjAccount(h.db, row.id, az.f);
    expect(az.streamers[0].body.is_active).toBe(false);
    await h.db.update(users).set({ role: "locutor" }).where(eq(users.id, row.id));
  });

  it("asignar programas: los marcados quedan a su nombre y los desmarcados se sueltan", async () => {
    const [row] = await h.db.select().from(users).where(eq(users.email, "dj@example.com"));
    const other = (await saveProgram(h.db, admin, { name: "Otro Programa" })).id;
    await assignPrograms(h.db, admin, row.id, [other]);
    const progs = await h.db.select().from(radioPrograms);
    expect(progs.find((p) => p.id === other)?.djUsername).toBe("carla-dj");
    expect(progs.find((p) => p.id === prog)?.djUsername).toBeNull();
    await assignPrograms(h.db, admin, row.id, [prog]);
    expect(await scheduleItemsFor(h.db, "carla-dj")).toHaveLength(3);
  });

  it("solo quien administra usuarios asigna programas; un no locutor no los conduce", async () => {
    const [row] = await h.db.select().from(users).where(eq(users.email, "dj@example.com"));
    const loc = await mk("locutor", "otro-loc");
    await expect(assignPrograms(h.db, loc, row.id, [])).rejects.toBeInstanceOf(ForbiddenError);
    const ed = await mk("editor", "ed1");
    await expect(assignPrograms(h.db, admin, ed.id, [])).rejects.toMatchObject({ code: "not_locutor" });
    await expect(resyncDj(h.db, loc, row.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("pasar a alguien a locutor le crea su usuario de DJ", async () => {
    const e = await mk("colaborador", "futuro");
    const { dj } = await updateUserAdmin(h.db, admin, e.id, { role: "locutor" });
    expect(dj?.ok).toBe(false); // sin AzuraCast de pruebas
    expect((await h.db.select().from(users).where(eq(users.id, e.id)))[0].djUsername).toBe("futuro");
  });
});

describe("entrada del locutor al estudio", () => {
  let loc: Actor;
  beforeAll(async () => {
    const [row] = await h.db.select().from(users).where(eq(users.email, "dj@example.com"));
    loc = { id: row.id, role: "locutor" };
  });

  it("en su horario recibe su usuario y su clave (desde 15 minutos antes)", async () => {
    const c = await getDjCredentials(h.db, loc, WED_2030);
    expect(c).toMatchObject({ user: "carla-dj", programName: "Noche Electrónica" });
    expect(c.password).toBe(await djPassword(h.db, loc.id));
    expect((await getDjCredentials(h.db, loc, new Date("2026-03-04T19:50:00-05:00"))).user).toBe("carla-dj");
  });

  it("fuera de su horario no recibe nada y se le dice cuándo es el siguiente", async () => {
    const out = new Date("2026-03-04T15:00:00-05:00");
    await expect(getDjCredentials(h.db, loc, out)).rejects.toMatchObject({ code: "dj_out_of_schedule", message: expect.stringContaining("Noche Electrónica") });
    expect((await djCredentialsHandler(h.db, loc, out)).status).toBe(403);
  });

  it("quien no es locutor, o está desactivado, no recibe credenciales", async () => {
    expect((await djCredentialsHandler(h.db, admin, WED_2030)).status).toBe(403);
    expect((await djCredentialsHandler(h.db, null, WED_2030)).status).toBe(401);
    await h.db.update(users).set({ active: false }).where(eq(users.id, loc.id));
    expect((await djCredentialsHandler(h.db, loc, WED_2030)).status).toBe(403);
    await h.db.update(users).set({ active: true }).where(eq(users.id, loc.id));
  });

  it("el programa que ve el locutor sale de su sesión: ignora el usuario pedido y no ofrece otros programas", async () => {
    const j = await (await djProgramHandler(h.db, loc, "otra-persona", WED_2030)).json();
    expect(j.scheduled.program.name).toBe("Noche Electrónica");
    expect(j.others).toEqual([]);
  });
});
