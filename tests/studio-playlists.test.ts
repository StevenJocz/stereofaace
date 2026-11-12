import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { deleteSaved, getSaved, listSaved, saveList } from "@/modules/studio/playlists";
import { makeDb } from "./helpers";

let h: DbHandle;
let dj1: Actor;
let dj2: Actor;
let admin: Actor;
let redactor: Actor;
const item = (id: string, title = "T" + id) => ({ azId: id, title, artist: "A", durationSec: 120 });
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};

beforeAll(async () => {
  h = await makeDb();
  dj1 = await mk("editor", "dj1");
  dj2 = await mk("editor", "dj2");
  admin = await mk("admin", "adm");
  redactor = await mk("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("listas guardadas", () => {
  it("guarda y lee una lista con sus pistas en orden", async () => {
    const { id } = await saveList(h.db, dj1, { name: "Viernes electrónico", items: [item("3"), item("1"), item("2")] });
    const l = await getSaved(h.db, dj1, id);
    expect(l.name).toBe("Viernes electrónico");
    expect(l.items.map((i) => i.azId)).toEqual(["3", "1", "2"]);
  });

  it("descarta ítems sin azId numérico e informa cuántos se omitieron", async () => {
    const r = await saveList(h.db, dj1, { name: "Mixta", items: [item("5"), { azId: "../x", title: "mal", artist: "", durationSec: null }, { azId: "", title: "vacío", artist: "", durationSec: null }] });
    expect(r.skipped).toBe(2);
    expect((await getSaved(h.db, dj1, r.id)).items).toHaveLength(1);
  });

  it("rechaza lista vacía, nombre vacío o de más de 80 caracteres y más de 500 pistas", async () => {
    await expect(saveList(h.db, dj1, { name: "Vacía", items: [] })).rejects.toBeInstanceOf(ZodError);
    await expect(saveList(h.db, dj1, { name: "", items: [item("1")] })).rejects.toBeInstanceOf(ZodError);
    await expect(saveList(h.db, dj1, { name: "x".repeat(81), items: [item("1")] })).rejects.toBeInstanceOf(ZodError);
    await expect(saveList(h.db, dj1, { name: "Enorme", items: Array.from({ length: 501 }, (_, i) => item(String(i + 1))) })).rejects.toBeInstanceOf(ZodError);
  });

  it("guardar con el mismo id actualiza la lista", async () => {
    const { id } = await saveList(h.db, dj1, { name: "Versión 1", items: [item("1")] });
    await saveList(h.db, dj1, { id, name: "Versión 2", items: [item("1"), item("2")] });
    const l = await getSaved(h.db, dj1, id);
    expect(l.name).toBe("Versión 2");
    expect(l.items).toHaveLength(2);
  });

  it("un DJ no ve ni lee ni borra las listas de otro, pero un admin sí", async () => {
    const { id } = await saveList(h.db, dj1, { name: "Privada de dj1", items: [item("9")] });
    expect((await listSaved(h.db, dj2)).some((l) => l.id === id)).toBe(false);
    await expect(getSaved(h.db, dj2, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteSaved(h.db, dj2, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveList(h.db, dj2, { id, name: "Secuestrada", items: [item("1")] })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listSaved(h.db, admin)).some((l) => l.id === id && l.mine === false)).toBe(true);
    expect((await getSaved(h.db, admin, id)).name).toBe("Privada de dj1");
  });

  it("listSaved marca las propias y cuenta las pistas; borrar la quita", async () => {
    const { id } = await saveList(h.db, dj1, { name: "A borrar", items: [item("1"), item("2")] });
    expect((await listSaved(h.db, dj1)).find((l) => l.id === id)).toMatchObject({ count: 2, mine: true });
    await deleteSaved(h.db, dj1, id);
    expect((await listSaved(h.db, dj1)).some((l) => l.id === id)).toBe(false);
  });

  it("un redactor no puede usarlas y un id mal formado da error de dominio", async () => {
    await expect(listSaved(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getSaved(h.db, dj1, "no-uuid")).rejects.toMatchObject({ code: "playlist_not_found" });
  });
});
