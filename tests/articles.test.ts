import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { articleRevisions, articles, categories, users } from "@/db/schema";
import {
  createArticle,
  deleteArticle,
  getArticleAdmin,
  listArticlesAdmin,
  listRevisions,
  restoreRevision,
  setArticleStatus,
  updateArticle,
} from "@/modules/content/admin";
import { getArticleBySlug, getHomeData, getRelatedArticles, listPublishedArticles } from "@/modules/content/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
let redactor2: Actor;
let catId: string;
const NOW = new Date("2026-11-10T15:00:00Z");

async function mk(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db
    .insert(users)
    .values({ email: `${n}@example.com`, name: n, role })
    .returning();
  return { id: u.id, role: u.role };
}
const body = (t: string) => `<p>${t}</p>`;

beforeAll(async () => {
  h = await makeDb({ seed: true, now: NOW });
  editor = await mk("editor", "edi");
  redactor = await mk("redactor", "red");
  redactor2 = await mk("redactor", "red2");
  [{ id: catId }] = await h.db.select().from(categories).where(eq(categories.slug, "noticias"));
});
afterAll(async () => {
  await h.close();
});

describe("guardar con sanitización", () => {
  it("el HTML peligroso nunca llega a la base de datos; se calcula el tiempo de lectura", async () => {
    const a = await createArticle(h.db, redactor, {
      title: "Prueba de saneamiento",
      bodyHtml: `<p onclick="x()">Hola <script>alert(1)</script></p><iframe src="https://evil.example/x"></iframe><img src="javascript:alert(1)">${"palabra ".repeat(500)}`,
    });
    const row = await getArticleAdmin(h.db, redactor, a.id);
    expect(row?.bodyHtml).not.toMatch(/script|onclick|iframe|javascript:/i);
    expect(row?.readMinutes).toBe(3);
  });
  it("etiquetas y fuentes se sincronizan y se reemplazan", async () => {
    const a = await createArticle(h.db, redactor, {
      title: "Con etiquetas",
      tags: ["Techno", "techno", "Berlín"],
      references: [{ title: "Fuente uno", url: "https://example.com/a", outlet: "Medio" }],
    });
    let row = await getArticleAdmin(h.db, redactor, a.id);
    expect(row?.tags.sort()).toEqual(["Berlín", "Techno"]);
    expect(row?.references).toHaveLength(1);
    await updateArticle(h.db, redactor, a.id, { title: "Con etiquetas", tags: ["Ambient"], references: [] });
    row = await getArticleAdmin(h.db, redactor, a.id);
    expect(row?.tags).toEqual(["Ambient"]);
    expect(row?.references).toHaveLength(0);
  });
  it("rechaza fuentes no https", async () => {
    await expect(
      createArticle(h.db, redactor, { title: "Mala fuente", references: [{ title: "x1", url: "http://example.com" }] }),
    ).rejects.toThrow();
  });
});

describe("permisos y conflictos de edición", () => {
  it("el redactor edita lo suyo, no lo ajeno ni lo publicado", async () => {
    const a = await createArticle(h.db, redactor, { title: "Mío", bodyHtml: body("uno") });
    await expect(updateArticle(h.db, redactor2, a.id, { title: "Ajeno" })).rejects.toBeInstanceOf(ForbiddenError);
    await updateArticle(h.db, redactor, a.id, { title: "Mío editado", bodyHtml: body("dos") });
    await updateArticle(h.db, editor, a.id, {
      title: "Mío editado",
      bodyHtml: body("dos"),
      categoryId: catId,
      status: "published",
    });
    await expect(updateArticle(h.db, redactor, a.id, { title: "Ya publicado" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("el redactor no puede publicar ni programar al guardar", async () => {
    const a = await createArticle(h.db, redactor, { title: "Quiero publicar", bodyHtml: body("x") });
    await expect(
      updateArticle(h.db, redactor, a.id, { title: "Quiero publicar", status: "published" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setArticleStatus(h.db, redactor, a.id, "published")).rejects.toBeInstanceOf(ForbiddenError);
    await setArticleStatus(h.db, redactor, a.id, "review");
    expect((await getArticleAdmin(h.db, redactor, a.id))?.status).toBe("review");
  });
  it("detecta conflictos con expectedUpdatedAt (guardado automático seguro)", async () => {
    const a = await createArticle(h.db, editor, { title: "Concurrente", bodyHtml: body("a") });
    const first = await getArticleAdmin(h.db, editor, a.id);
    const r1 = await updateArticle(h.db, editor, a.id, {
      title: "Concurrente",
      bodyHtml: body("b"),
      expectedUpdatedAt: first!.updatedAt,
    });
    await expect(
      updateArticle(h.db, editor, a.id, {
        title: "Concurrente",
        bodyHtml: body("c"),
        expectedUpdatedAt: first!.updatedAt,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await updateArticle(h.db, editor, a.id, {
      title: "Concurrente",
      bodyHtml: body("c"),
      expectedUpdatedAt: r1.updatedAt,
    });
  });
});

describe("estados, publicación y programación", () => {
  it("publicar exige contenido y categoría", async () => {
    const a = await createArticle(h.db, editor, { title: "Sin nada" });
    await expect(setArticleStatus(h.db, editor, a.id, "published")).rejects.toMatchObject({ code: "empty" });
    await updateArticle(h.db, editor, a.id, { title: "Sin nada", bodyHtml: body("ya") });
    await expect(setArticleStatus(h.db, editor, a.id, "published")).rejects.toMatchObject({ code: "no_category" });
    await updateArticle(h.db, editor, a.id, { title: "Sin nada", bodyHtml: body("ya"), categoryId: catId });
    await setArticleStatus(h.db, editor, a.id, "published");
    expect((await getArticleBySlug(h.db, "sin-nada", "es", new Date(Date.now() + 1000)))?.title).toBe("Sin nada");
  });
  it("programado: invisible hasta su fecha y público automáticamente después", async () => {
    const a = await createArticle(h.db, editor, { title: "Programada", bodyHtml: body("luego"), categoryId: catId });
    const when = new Date(Date.now() + 3600_000);
    await setArticleStatus(h.db, editor, a.id, "scheduled", when);
    expect(await getArticleBySlug(h.db, "programada", "es", new Date())).toBeNull();
    expect((await listPublishedArticles(h.db, { q: "programada" }, new Date())).total).toBe(0);
    const later = new Date(when.getTime() + 1000);
    expect((await getArticleBySlug(h.db, "programada", "es", later))?.title).toBe("Programada");
    expect((await listPublishedArticles(h.db, { q: "programada" }, later)).total).toBe(1);
  });
  it("no se programa en el pasado", async () => {
    const a = await createArticle(h.db, editor, { title: "Pasado", bodyHtml: body("x"), categoryId: catId });
    await expect(setArticleStatus(h.db, editor, a.id, "scheduled", new Date(Date.now() - 1000))).rejects.toMatchObject({
      code: "bad_date",
    });
  });
  it("volver a borrador lo retira del sitio", async () => {
    const a = await createArticle(h.db, editor, {
      title: "Efímera",
      bodyHtml: body("x"),
      categoryId: catId,
      status: "published",
    });
    const future = new Date(Date.now() + 1000);
    expect(await getArticleBySlug(h.db, "efimera", "es", future)).not.toBeNull();
    await setArticleStatus(h.db, editor, a.id, "draft");
    expect(await getArticleBySlug(h.db, "efimera", "es", future)).toBeNull();
  });
});

describe("revisiones", () => {
  it("guarda una revisión por cambio de título o cuerpo y permite restaurar", async () => {
    const a = await createArticle(h.db, editor, { title: "Versión 1", bodyHtml: body("primera") });
    await updateArticle(h.db, editor, a.id, { title: "Versión 2", bodyHtml: body("segunda") });
    await updateArticle(h.db, editor, a.id, { title: "Versión 2", bodyHtml: body("segunda") }); // sin cambios
    const revs = await listRevisions(h.db, editor, a.id);
    expect(revs).toHaveLength(2);
    const original = revs[revs.length - 1];
    await restoreRevision(h.db, editor, a.id, original.id);
    const row = await getArticleAdmin(h.db, editor, a.id);
    expect(row?.title).toBe("Versión 1");
    expect(row?.bodyHtml).toContain("primera");
    expect((await listRevisions(h.db, editor, a.id)).length).toBe(3);
  });
  it("no restaura revisiones de otro artículo", async () => {
    const a = await createArticle(h.db, editor, { title: "Artículo A", bodyHtml: body("a") });
    const b = await createArticle(h.db, editor, { title: "Artículo B", bodyHtml: body("b") });
    const [rb] = await h.db.select().from(articleRevisions).where(eq(articleRevisions.articleId, b.id));
    await expect(restoreRevision(h.db, editor, a.id, rb.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("borrado, listado y relacionados", () => {
  it("borrar retira el artículo, sus bloques de portada y el listado", async () => {
    const home = await getHomeData(h.db, NOW);
    const target = home.features[0];
    await deleteArticle(h.db, editor as Actor, target.id).catch((e) => expect(e).toBeInstanceOf(ForbiddenError));
    const admin = await mk("admin", "adm");
    await deleteArticle(h.db, admin, target.id);
    expect((await getHomeData(h.db, NOW)).features.map((f) => f.id)).not.toContain(target.id);
    expect((await listArticlesAdmin(h.db, admin, { pageSize: 100 })).items.map((i) => i.id)).not.toContain(target.id);
  });
  it("el listado de administración filtra por estado y título", async () => {
    const r = await listArticlesAdmin(h.db, editor, { status: "draft" });
    expect(r.items.every((i) => i.status === "draft")).toBe(true);
    const f = await listArticlesAdmin(h.db, editor, { q: "versión" });
    expect(f.items.some((i) => /versi/i.test(i.title))).toBe(true);
    expect((await listArticlesAdmin(h.db, editor, { q: "%%" })).total).toBe(0);
  });
  it("relacionados: misma categoría primero y nunca el propio artículo", async () => {
    const art = await getArticleBySlug(h.db, "techno-de-madrugada-y-la-geografia-de-la-pista", "es", NOW);
    expect(art).not.toBeNull();
    const rel = await getRelatedArticles(h.db, art!, 3, NOW);
    expect(rel).toHaveLength(3);
    expect(rel.map((r) => r.id)).not.toContain(art!.id);
  });
  it("el slug cambiado se mantiene único", async () => {
    const a = await createArticle(h.db, editor, { title: "Slug uno" });
    const b = await createArticle(h.db, editor, { title: "Slug dos" });
    const r = await updateArticle(h.db, editor, b.id, { title: "Slug dos", slug: "slug-uno" });
    expect(r.slug).toBe("slug-uno-2");
    expect(a.slug).toBe("slug-uno");
  });
  it("un artículo nuevo cuenta como una sola fila y no se duplica al reabrirse", async () => {
    const before = await h.db.select({ id: articles.id }).from(articles);
    await createArticle(h.db, editor, { title: "Conteo" });
    expect((await h.db.select({ id: articles.id }).from(articles)).length).toBe(before.length + 1);
  });
});
