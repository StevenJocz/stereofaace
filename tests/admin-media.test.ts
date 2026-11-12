import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { articles, artists, auditLogs, media, pages, users } from "@/db/schema";
import { createUploadedMedia } from "@/modules/media/service";
import { deleteMedia, listMediaAdmin, updateMediaMeta } from "@/modules/media/admin";
import { makeDb } from "./helpers";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01,
]);

let h: DbHandle;
let root: string;
let admin: Actor;
let colaborador: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const upload = (alt: string) =>
  createUploadedMedia(h.db, admin, new File([PNG], "x.png", { type: "image/png" }), {
    alt,
    credit: "Autor",
    license: "Propia",
    root,
  });

beforeAll(async () => {
  h = await makeDb();
  root = await mkdtemp(path.join(os.tmpdir(), "sf-admin-media-"));
  admin = await mkUser("superadmin", "root");
  colaborador = await mkUser("colaborador", "colab");
});
afterAll(async () => {
  await h.close();
  await rm(root, { recursive: true, force: true });
});

describe("medios (administración)", () => {
  it("updateMediaMeta cambia los metadatos y deja auditoría", async () => {
    const m = await upload("Alt original");
    await updateMediaMeta(h.db, admin, m.id, { alt: "Alt nuevo", credit: "Otro", license: "CC BY" });
    const [row] = await h.db.select().from(media).where(eq(media.id, m.id));
    expect(row).toMatchObject({ alt: "Alt nuevo", credit: "Otro", license: "CC BY" });
    const logs = await h.db.select().from(auditLogs).where(eq(auditLogs.entityId, m.id));
    expect(logs.map((l) => l.action)).toContain("media.update");
  });

  it("no borra un medio usado como foto de artista (in_use)", async () => {
    const m = await upload("Foto");
    await h.db.insert(artists).values({ slug: "con-foto", name: "Con foto", photoId: m.id });
    await expect(deleteMedia(h.db, admin, m.id, { root })).rejects.toMatchObject({
      name: "DomainError",
      code: "in_use",
    });
  });

  it("no borra un medio referenciado solo desde el cuerpo de un artículo", async () => {
    const m = await upload("En cuerpo");
    await h.db.insert(articles).values({
      slug: "con-imagen",
      title: "Con imagen",
      bodyHtml: `<p><img src="https://example.org/media/${m.storageKey}" alt="x"></p>`,
    });
    await expect(deleteMedia(h.db, admin, m.id, { root })).rejects.toBeInstanceOf(DomainError);
  });

  it("no borra un medio usado dentro del cuerpo de una página fija", async () => {
    const m = await upload("En página");
    await h.db.insert(pages).values({
      slug: "acerca",
      title: "Acerca",
      bodyHtml: `<p><img src="https://example.org/media/${m.storageKey}" alt="x"></p>`,
    });
    await expect(deleteMedia(h.db, admin, m.id, { root })).rejects.toMatchObject({ code: "in_use" });
  });

  it("borra de la BD y del disco un medio libre", async () => {
    const m = await upload("Libre");
    await deleteMedia(h.db, admin, m.id, { root });
    expect(await h.db.select().from(media).where(eq(media.id, m.id))).toHaveLength(0);
    await expect(readFile(path.join(root, m.storageKey))).rejects.toThrow();
  });

  it("un colaborador puede ver la biblioteca pero no borrar", async () => {
    const m = await upload("Protegido");
    const list = await listMediaAdmin(h.db, colaborador, {});
    expect(list.items.length).toBeGreaterThan(0);
    await expect(deleteMedia(h.db, colaborador, m.id, { root })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("la búsqueda trata % y _ como texto literal", async () => {
    await upload("100% real");
    const hit = await listMediaAdmin(h.db, admin, { search: "100%" });
    expect(hit.items.map((i) => i.alt)).toEqual(["100% real"]);
    const none = await listMediaAdmin(h.db, admin, { search: "%" });
    expect(none.items.every((i) => i.alt.includes("%"))).toBe(true);
  });
});
