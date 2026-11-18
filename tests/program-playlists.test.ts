import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { radioPrograms, users } from "@/db/schema";
import { addSlot, removeSlot, saveProgram, deleteProgram, listSlotsAdmin } from "@/modules/schedule/service";
import { assignPrograms } from "@/modules/users/admin";
import { deleteAutoDjPlaylist, listAutoDjPlaylists, saveAutoDjPlaylist } from "@/modules/studio/library-admin";
import { azItemsFromSlots, linkProgramPlaylist, listProgramMusic, scheduleLines, syncProgramPlaylists, unlinkProgramPlaylist } from "@/modules/studio/program-playlists";
import { saveStudioConfig } from "@/modules/studio/settings";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let locutor: Actor;
let otro: Actor;
let redactor: Actor;
let noche: string;
let mananas: string;

const mk = async (role: Actor["role"], n: string, extra: Partial<typeof users.$inferInsert> = {}): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role, ...extra }).returning();
  return { id: u.id, role: u.role };
};

/** AzuraCast simulado con listas en memoria. */
function azura() {
  const calls: { method: string; path: string; body: Record<string, unknown> | undefined }[] = [];
  let next = 10;
  const playlists: Record<string, unknown>[] = [{ id: 1, name: "Rotación", source: "songs", is_enabled: true, num_songs: 5 }, { id: 2, name: "Señal", source: "remote_url" }];
  const f = (async (url: string, init?: RequestInit) => {
    const path = new URL(String(url)).pathname.replace("/api/station/stereo_face", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, path, body });
    if (path === "/playlists" && method === "GET") return Response.json(playlists);
    if (path === "/playlists" && method === "POST") {
      playlists.push({ id: next++, source: "songs", num_songs: 0, ...body });
      return Response.json({});
    }
    const m = /^\/playlist\/(\d+)$/.exec(path);
    if (m && method === "PUT") {
      Object.assign(playlists.find((p) => p.id === Number(m[1]))!, body);
      return Response.json({});
    }
    return Response.json({});
  }) as unknown as typeof fetch;
  return { f, calls, playlists };
}

beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  locutor = await mk("locutor", "loc", { djUsername: "loc-dj" });
  otro = await mk("locutor", "otro", { djUsername: "otro-dj" });
  redactor = await mk("redactor", "red");
  await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.example.org", stationId: "stereo_face", apiKey: "K:S" });
  noche = (await saveProgram(h.db, admin, { name: "Noche Electrónica" })).id;
  mananas = (await saveProgram(h.db, admin, { name: "Mañanas" })).id;
  await assignPrograms(h.db, admin, locutor.id, [noche]);
  await assignPrograms(h.db, admin, otro.id, [mananas]);
  await addSlot(h.db, admin, { programId: noche, kind: "weekly", weekday: 5, start: "22:00", end: "02:00" });
  await addSlot(h.db, admin, { programId: noche, kind: "weekly", weekday: 6, start: "22:00", end: "02:00" });
  await addSlot(h.db, admin, { programId: noche, kind: "weekly", weekday: 0, start: "20:00", end: "22:00" });
  await addSlot(h.db, admin, { programId: noche, kind: "once", date: "2026-12-24", start: "21:00", end: "23:00" });
});
afterAll(() => h.close());

describe("horario del programa → AzuraCast", () => {
  it("une los tramos semanales con la misma hora, usa días ISO (domingo = 7) y fecha en los puntuales", async () => {
    const slots = await h.db.query.radioSchedule.findMany({ where: (t, { eq: e }) => e(t.programId, noche) });
    const items = azItemsFromSlots(slots);
    expect(items).toContainEqual({ start_time: 2200, end_time: 200, start_date: null, end_date: null, days: [5, 6], loop_once: false });
    expect(items).toContainEqual({ start_time: 2000, end_time: 2200, start_date: null, end_date: null, days: [7], loop_once: false });
    expect(items).toContainEqual({ start_time: 2100, end_time: 2300, start_date: "2026-12-24", end_date: "2026-12-24", days: [], loop_once: false });
    expect(items).toHaveLength(3);
    expect(scheduleLines(slots)).toEqual(["VIE · SÁB 22:00–02:00", "DOM 20:00–22:00", "2026-12-24 21:00–23:00"]);
  });
});

describe("ligar un programa con su lista de música", () => {
  it("crea una lista nueva con el horario del programa, peso alto, y la deja ligada", async () => {
    const az = azura();
    const r = await linkProgramPlaylist(h.db, locutor, noche, "new", az.f);
    expect(r.playlistId).toBeGreaterThanOrEqual(10);
    const post = az.calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ name: "Programa · Noche Electrónica", type: "default", source: "songs", weight: 25, is_enabled: true });
    expect((post.body!.schedule_items as unknown[]).length).toBe(3);
    const [row] = await h.db.select().from(radioPrograms).where(eq(radioPrograms.id, noche));
    expect(row.playlistId).toBe(r.playlistId);
  });

  it("un locutor solo gestiona la música de sus programas; el equipo editorial, de ninguno", async () => {
    const az = azura();
    await expect(linkProgramPlaylist(h.db, otro, noche, "new", az.f)).rejects.toMatchObject({ code: "program_not_yours" });
    await expect(linkProgramPlaylist(h.db, redactor, noche, "new", az.f)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(unlinkProgramPlaylist(h.db, otro, noche)).rejects.toMatchObject({ code: "program_not_yours" });
    expect((await listProgramMusic(h.db, locutor, az.f)).map((p) => p.name)).toEqual(["Noche Electrónica"]);
    expect((await listProgramMusic(h.db, admin, az.f)).map((p) => p.name).sort()).toEqual(["Mañanas", "Noche Electrónica"]);
  });

  it("un administrador puede con cualquier programa; una lista no se liga a dos programas ni si es de señal externa", async () => {
    const az = azura();
    await linkProgramPlaylist(h.db, admin, mananas, 1, az.f);
    expect(az.calls.find((c) => c.method === "PUT")!.body).toMatchObject({ type: "default", weight: 25 });
    await expect(linkProgramPlaylist(h.db, admin, noche, 1, az.f)).rejects.toMatchObject({ code: "playlist_taken" });
    await expect(linkProgramPlaylist(h.db, admin, noche, 2, az.f)).rejects.toMatchObject({ code: "library_playlist" });
    await expect(linkProgramPlaylist(h.db, admin, noche, 999, az.f)).rejects.toMatchObject({ code: "playlist_not_found" });
    await h.db.update(radioPrograms).set({ playlistId: null }).where(eq(radioPrograms.id, mananas));
  });

  it("no crea dos listas con el mismo nombre", async () => {
    const az = azura();
    await linkProgramPlaylist(h.db, admin, noche, "new", az.f);
    await expect(linkProgramPlaylist(h.db, admin, noche, "new", az.f)).rejects.toMatchObject({ code: "playlist_exists" });
  });
});

describe("la lista ligada sigue a la Programación", () => {
  it("al cambiar la parrilla se reenvía el horario; al desactivar o borrar el programa se pausa", async () => {
    const az = azura();
    await h.db.update(radioPrograms).set({ playlistId: null });
    await linkProgramPlaylist(h.db, admin, noche, "new", az.f);
    const id = (await h.db.select().from(radioPrograms).where(eq(radioPrograms.id, noche)))[0].playlistId!;
    const slot = (await listSlotsAdmin(h.db, admin)).find((s) => s.programId === noche && s.weekday === 0)!;
    await removeSlot(h.db, admin, slot.id); // la sincronización real usa fetch global (sin servidor): se prueba la función directa
    az.calls.length = 0;
    expect((await syncProgramPlaylists(h.db, az.f)).ok).toBe(true);
    const put = az.calls.find((c) => c.method === "PUT" && c.path === `/playlist/${id}`)!;
    expect((put.body!.schedule_items as { days: number[] }[]).some((i) => i.days.includes(7))).toBe(false); // el domingo ya no está
    expect(put.body).toMatchObject({ is_enabled: true });
    await deleteProgram(h.db, admin, noche);
    az.calls.length = 0;
    await syncProgramPlaylists(h.db, az.f);
    expect(az.calls.find((c) => c.method === "PUT")!.body).toMatchObject({ is_enabled: false });
  });

  it("si AzuraCast falla, no lanza: devuelve el aviso", async () => {
    const down = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const r = await syncProgramPlaylists(h.db, down);
    expect(r.ok).toBe(false);
    expect(r.warning).toMatch(/AzuraCast/);
  });
});

describe("la rotación general no toca las listas de un programa", () => {
  it("no se editan ni se borran desde la rotación libre, y se marcan con su programa", async () => {
    const az = azura();
    const prog = (await saveProgram(h.db, admin, { name: "Viernes" })).id;
    await h.db.update(radioPrograms).set({ playlistId: 1 }).where(eq(radioPrograms.id, prog));
    const lists = await listAutoDjPlaylists(h.db, admin, az.f);
    expect(lists.find((l) => l.id === 1)).toMatchObject({ editable: false, program: "Viernes" });
    await expect(saveAutoDjPlaylist(h.db, admin, { id: 1, name: "Otra" }, az.f)).rejects.toMatchObject({ code: "library_playlist", message: expect.stringContaining("Viernes") });
    await expect(deleteAutoDjPlaylist(h.db, admin, 1, az.f)).rejects.toMatchObject({ code: "library_playlist" });
  });
});
