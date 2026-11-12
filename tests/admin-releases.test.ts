import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { artists, users } from "@/db/schema";
import { listLatestReleases } from "@/modules/releases/service";
import {
  createRelease,
  deleteRelease,
  getReleaseAdmin,
  listReleasesAdmin,
  restoreRelease,
  setReleaseStatus,
  updateRelease,
} from "@/modules/releases/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
let a1: string;
let a2: string;
const today = new Date();

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const base = (over: Record<string, unknown> = {}) => ({
  title: "Disco Uno",
  kind: "album",
  releasedAt: today,
  artistIds: [a1],
  ...over,
});

beforeAll(async () => {
  h = await makeDb();
  editor = await mkUser("editor", "ed");
  redactor = await mkUser("redactor", "red");
  const rows = await h.db
    .insert(artists)
    .values([
      { slug: "uno", name: "Uno" },
      { slug: "dos", name: "Dos" },
    ])
    .returning();
  [a1, a2] = rows.map((r) => r.id);
});
afterAll(async () => {
  await h.close();
});

describe("lanzamientos (administración)", () => {
  it("conserva el orden de los artistas", async () => {
    const { id } = await createRelease(h.db, editor, base({ title: "Split", artistIds: [a2, a1] }));
    expect((await getReleaseAdmin(h.db, editor, id))?.artistIds).toEqual([a2, a1]);
  });

  it("exige al menos un artista y un reproductor oficial permitido", async () => {
    await expect(createRelease(h.db, editor, base({ artistIds: [] }))).rejects.toBeInstanceOf(ZodError);
    await expect(
      createRelease(h.db, editor, base({ embedUrl: "https://evil.example.com/player" })),
    ).rejects.toBeInstanceOf(ZodError);
  });

  it("slugs repetidos reciben sufijo", async () => {
    const a = await createRelease(h.db, editor, base({ title: "Mismo" }));
    const b = await createRelease(h.db, editor, base({ title: "Mismo" }));
    expect([a.slug, b.slug]).toEqual(["mismo", "mismo-2"]);
  });

  it("borrador no sale en la portada; publicado sí", async () => {
    const { id } = await createRelease(h.db, editor, base({ title: "Visible luego" }));
    expect((await listLatestReleases(h.db, 50)).map((r) => r.id)).not.toContain(id);
    await setReleaseStatus(h.db, editor, id, "published");
    expect((await listLatestReleases(h.db, 50)).map((r) => r.id)).toContain(id);
    await setReleaseStatus(h.db, editor, id, "draft");
    expect((await listLatestReleases(h.db, 50)).map((r) => r.id)).not.toContain(id);
  });

  it("un redactor puede crear borradores pero no publicar", async () => {
    const { id } = await createRelease(h.db, redactor, base({ title: "Borrador redactor" }));
    await expect(setReleaseStatus(h.db, redactor, id, "published")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createRelease(h.db, redactor, base({ title: "Directo", status: "published" }))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(updateRelease(h.db, redactor, id, base({ status: "published" }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("el borrado es lógico y se puede restaurar", async () => {
    const { id } = await createRelease(h.db, editor, base({ title: "Efímero", status: "published" }));
    await deleteRelease(h.db, editor, id);
    expect((await listLatestReleases(h.db, 50)).map((r) => r.id)).not.toContain(id);
    expect((await listReleasesAdmin(h.db, editor, {})).items.map((r) => r.id)).not.toContain(id);
    await restoreRelease(h.db, editor, id);
    expect((await listLatestReleases(h.db, 50)).map((r) => r.id)).toContain(id);
  });

  it("filtra por estado, tipo y texto", async () => {
    await createRelease(h.db, editor, base({ title: "Solo EP", kind: "ep" }));
    const eps = await listReleasesAdmin(h.db, editor, { kind: "ep" });
    expect(eps.items.every((r) => r.kind === "ep")).toBe(true);
    const found = await listReleasesAdmin(h.db, editor, { search: "solo ep" });
    expect(found.items.map((r) => r.title)).toEqual(["Solo EP"]);
    const drafts = await listReleasesAdmin(h.db, editor, { status: "draft" });
    expect(drafts.items.every((r) => r.status === "draft")).toBe(true);
  });
});
