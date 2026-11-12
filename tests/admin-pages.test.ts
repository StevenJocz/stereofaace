import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import {
  createPage,
  deletePage,
  getPageAdmin,
  getPublishedPage,
  listPagesAdmin,
  setPageStatus,
  updatePage,
} from "@/modules/content/pages-admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let redactor: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const body = (over: Record<string, unknown> = {}) => ({
  title: "Acerca de",
  bodyJson: { type: "doc", content: [] },
  bodyHtml: "<p>Hola</p>",
  ...over,
});

beforeAll(async () => {
  h = await makeDb();
  admin = await mkUser("admin", "adm");
  editor = await mkUser("editor", "ed");
  redactor = await mkUser("redactor", "red");
});
afterAll(async () => {
  await h.close();
});

describe("páginas fijas", () => {
  it("sanea el cuerpo: un <script> no llega a la base de datos", async () => {
    const { id } = await createPage(h.db, editor, body({ title: "Con script", bodyHtml: '<p>Hola</p><script>alert(1)</script><img src="x" onerror="alert(2)">' }));
    const page = await getPageAdmin(h.db, editor, id);
    expect(page?.bodyHtml).toContain("Hola");
    expect(page?.bodyHtml).not.toMatch(/script|onerror/i);
  });

  it("borrador no es público; publicar lo expone y despublicar lo oculta", async () => {
    const { id, slug } = await createPage(h.db, editor, body({ title: "Reglas" }));
    expect(slug).toBe("reglas");
    expect(await getPublishedPage(h.db, "reglas")).toBeNull();
    await setPageStatus(h.db, editor, id, "published");
    expect(await getPublishedPage(h.db, "reglas")).toMatchObject({ title: "Reglas", bodyHtml: "<p>Hola</p>" });
    await setPageStatus(h.db, editor, id, "draft");
    expect(await getPublishedPage(h.db, "reglas")).toBeNull();
  });

  it("un slug explícito repetido da un error claro; el automático recibe sufijo", async () => {
    await createPage(h.db, editor, body({ title: "Contacto" }));
    await expect(createPage(h.db, editor, body({ title: "Otro", slug: "contacto" }))).rejects.toMatchObject({ code: "slug_taken" });
    const auto = await createPage(h.db, editor, body({ title: "Contacto" }));
    expect(auto.slug).toBe("contacto-2");
  });

  it("valida el slug y actualiza título y cuerpo", async () => {
    await expect(createPage(h.db, editor, body({ slug: "Mal Slug" }))).rejects.toBeInstanceOf(ZodError);
    const { id } = await createPage(h.db, editor, body({ title: "Editable" }));
    await updatePage(h.db, editor, id, body({ title: "Editada", bodyHtml: "<p>Nuevo</p>" }));
    expect(await getPageAdmin(h.db, editor, id)).toMatchObject({ title: "Editada", bodyHtml: "<p>Nuevo</p>" });
  });

  it("solo quien tiene permiso crea o borra", async () => {
    await expect(createPage(h.db, redactor, body())).rejects.toBeInstanceOf(ForbiddenError);
    const { id } = await createPage(h.db, editor, body({ title: "Para borrar" }));
    await expect(deletePage(h.db, editor, id)).rejects.toBeInstanceOf(ForbiddenError);
    await deletePage(h.db, admin, id);
    expect((await listPagesAdmin(h.db, admin)).map((p) => p.id)).not.toContain(id);
  });
});
