import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError } from "@/lib/rbac";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { articles, auditLogs, articleRevisions, categories, events, genres, homeBlocks, users } from "@/db/schema";
import { getArticleBySlug, getHomeData, listPublishedArticles } from "@/modules/content/service";
import { createArticle } from "@/modules/content/admin";
import { listUpcomingEvents } from "@/modules/events/service";
import { listFeaturedArtists } from "@/modules/artists/service";
import { listLatestReleases } from "@/modules/releases/service";
import { subscribe } from "@/modules/settings/service";
import { seedDemo } from "@/db/seed";
import { makeDb } from "./helpers";

const NOW = new Date("2026-11-10T15:00:00Z");
let h: DbHandle;

beforeAll(async () => {
  h = await makeDb({ seed: true, now: NOW });
});
afterAll(async () => {
  await h.close();
});

describe("portada", () => {
  it("compone hero, destacados, feed, secciones, artistas, lanzamientos y agenda", async () => {
    const d = await getHomeData(h.db, NOW);
    expect(d.hero).toHaveLength(4);
    expect(d.hero[0].config.lines.length).toBeGreaterThan(1);
    expect(d.hero[0].config.figure).toBe(true);
    expect(d.features).toHaveLength(4);
    expect(d.recent).toHaveLength(3);
    expect(d.latest).toHaveLength(5);
    expect(d.electronica.length).toBeGreaterThan(0);
    expect(d.indie.length).toBeGreaterThan(0);
    expect(d.artists).toHaveLength(4);
    expect(d.artists[0].genre).toBeTruthy();
    expect(d.releases).toHaveLength(6);
    expect(d.releases[0].artistNames.length).toBeGreaterThan(0);
    expect(d.events).toHaveLength(6);
    expect(d.sections.length).toBeGreaterThan(3);
  });

  it("no repite artículos entre hero, destacados y feed", async () => {
    const d = await getHomeData(h.db, NOW);
    const ids = [...d.hero, ...d.features, ...d.recent, ...d.latest].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todo el contenido sembrado está marcado como demo", async () => {
    const d = await getHomeData(h.db, NOW);
    expect([...d.hero, ...d.features, ...d.recent, ...d.latest].every((a) => a.isDemo)).toBe(true);
    expect(d.artists.every((a) => a.isDemo)).toBe(true);
  });

  it("el seed es idempotente", async () => {
    await seedDemo(h.db, NOW);
    const all = await h.db.select({ id: articles.id }).from(articles);
    expect(all).toHaveLength(22);
  });
});

describe("visibilidad pública", () => {
  it("oculta borradores, programados a futuro y borrados", async () => {
    const [cat] = await h.db.select().from(categories).where(eq(categories.slug, "noticias"));
    const base = { categoryId: cat.id, title: "x", isDemo: true };
    await h.db.insert(articles).values([
      { ...base, slug: "vis-borrador", status: "draft", publishedAt: new Date(NOW.getTime() - 1000) },
      { ...base, slug: "vis-futuro", status: "published", publishedAt: new Date(NOW.getTime() + 3600_000) },
      {
        ...base,
        slug: "vis-borrado",
        status: "published",
        publishedAt: new Date(NOW.getTime() - 1000),
        deletedAt: NOW,
      },
      { ...base, slug: "vis-ok", status: "published", publishedAt: new Date(NOW.getTime() - 1000) },
    ]);
    expect(await getArticleBySlug(h.db, "vis-borrador", "es", NOW)).toBeNull();
    expect(await getArticleBySlug(h.db, "vis-futuro", "es", NOW)).toBeNull();
    expect(await getArticleBySlug(h.db, "vis-borrado", "es", NOW)).toBeNull();
    expect((await getArticleBySlug(h.db, "vis-ok", "es", NOW))?.slug).toBe("vis-ok");
    // Cuando llega la fecha, el artículo futuro se vuelve público.
    expect(await getArticleBySlug(h.db, "vis-futuro", "es", new Date(NOW.getTime() + 2 * 3600_000))).not.toBeNull();
  });
});

describe("listado y búsqueda", () => {
  it("pagina y cuenta", async () => {
    const p1 = await listPublishedArticles(h.db, { pageSize: 5, page: 1 }, NOW);
    const p2 = await listPublishedArticles(h.db, { pageSize: 5, page: 2 }, NOW);
    expect(p1.items).toHaveLength(5);
    expect(p2.items).toHaveLength(5);
    expect(p1.total).toBeGreaterThan(10);
    expect(p1.items.map((a) => a.id)).not.toContain(p2.items[0].id);
    const dates = p1.items.map((a) => a.publishedAt.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
  });
  it("filtra por categoría", async () => {
    const r = await listPublishedArticles(h.db, { category: "indie" }, NOW);
    expect(r.total).toBeGreaterThan(0);
    expect(r.items.every((a) => a.categorySlug === "indie")).toBe(true);
  });
  it("busca en español con texto completo (acentos y plurales)", async () => {
    const r = await listPublishedArticles(h.db, { q: "festivales" }, NOW);
    expect(r.items.some((a) => /festival/i.test(a.title))).toBe(true);
    const none = await listPublishedArticles(h.db, { q: "zzzxyz" }, NOW);
    expect(none.total).toBe(0);
  });
  it("una consulta con comillas o símbolos no rompe ni inyecta", async () => {
    const r = await listPublishedArticles(h.db, { q: `'; DROP TABLE articles; --` }, NOW);
    expect(r.total).toBe(0);
    expect((await h.db.select({ id: articles.id }).from(articles)).length).toBeGreaterThan(20);
  });
});

describe("agenda, artistas y lanzamientos", () => {
  it("filtra eventos por país y por género, siempre futuros", async () => {
    const co = await listUpcomingEvents(h.db, { country: "CO" }, NOW);
    expect(co.length).toBe(2);
    expect(co.every((e) => e.country === "CO" && e.startsAt > NOW)).toBe(true);
    const ambient = await listUpcomingEvents(h.db, { genre: "ambient" }, NOW);
    expect(ambient.map((e) => e.city)).toEqual(["Buenos Aires"]);
    const later = new Date(NOW.getTime() + 100 * 24 * 3600_000);
    expect(await listUpcomingEvents(h.db, {}, later)).toHaveLength(0);
  });
  it("los comodines de la ciudad no actúan como patrón", async () => {
    expect(await listUpcomingEvents(h.db, { city: "%" }, NOW)).toHaveLength(0);
    expect((await listUpcomingEvents(h.db, { city: "bogotá" }, NOW)).length).toBe(1);
  });
  it("artistas destacados con género y lanzamientos con créditos", async () => {
    const a = await listFeaturedArtists(h.db, 10);
    expect(a.map((x) => x.name)).toContain("Artista Demo 01");
    const r = await listLatestReleases(h.db, 10, NOW);
    expect(r[0].releasedAt >= new Date(NOW.getTime() - 30 * 24 * 3600_000)).toBe(true);
  });
  it("géneros base creados", async () => {
    expect((await h.db.select().from(genres)).length).toBeGreaterThanOrEqual(9);
  });
});

describe("escritura con permisos en el servidor", () => {
  async function user(role: "editor" | "redactor" | "colaborador", n: string) {
    const [u] = await h.db
      .insert(users)
      .values({ email: `${n}@example.com`, name: n, role })
      .returning();
    return { id: u.id, role: u.role };
  }

  it("rechaza sin sesión", async () => {
    await expect(createArticle(h.db, null, { title: "Sin sesión" })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("redactor crea borrador y lo envía a revisión, pero no publica ni programa", async () => {
    const red = await user("redactor", "ana");
    const draft = await createArticle(h.db, red, { title: "Mi primer borrador" });
    expect(draft.status).toBe("draft");
    expect((await createArticle(h.db, red, { title: "Para revisión", status: "review" })).status).toBe("review");
    await expect(createArticle(h.db, red, { title: "Quiero publicar", status: "published" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      createArticle(h.db, red, {
        title: "Programado",
        status: "scheduled",
        scheduledFor: new Date(Date.now() + 86_400_000),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("editor publica; se guardan revisión y auditoría", async () => {
    const ed = await user("editor", "eva");
    const a = await createArticle(h.db, ed, { title: "Nota publicada por editor", status: "published" });
    expect(a.status).toBe("published");
    const [row] = await h.db.select().from(articles).where(eq(articles.id, a.id));
    expect(row.publishedAt).not.toBeNull();
    expect(row.authorId).toBe(ed.id);
    expect(await h.db.select().from(articleRevisions).where(eq(articleRevisions.articleId, a.id))).toHaveLength(1);
    const log = await h.db.select().from(auditLogs).where(eq(auditLogs.entityId, a.id));
    expect(log[0].action).toBe("article.create");
    expect(log[0].userId).toBe(ed.id);
  });
  it("genera slugs únicos al repetir título", async () => {
    const col = await user("colaborador", "carlos");
    const a = await createArticle(h.db, col, { title: "Título repetido" });
    const b = await createArticle(h.db, col, { title: "Título repetido" });
    const c = await createArticle(h.db, col, { title: "Título repetido" });
    expect([a.slug, b.slug, c.slug]).toEqual(["titulo-repetido", "titulo-repetido-2", "titulo-repetido-3"]);
  });
  it("valida la entrada con Zod antes de tocar la base de datos", async () => {
    const ed = await user("editor", "otro");
    await expect(createArticle(h.db, ed, { title: "x" })).rejects.toThrow();
  });
});

describe("newsletter", () => {
  it("registra como pendiente y no duplica (sin distinguir mayúsculas)", async () => {
    expect((await subscribe(h.db, { email: "Fan@Example.com" })).status).toBe("created");
    expect((await subscribe(h.db, { email: "fan@example.com" })).status).toBe("exists");
    expect((await subscribe(h.db, { email: " FAN@EXAMPLE.COM " })).status).toBe("exists");
  });
  it("rechaza correos inválidos", async () => {
    await expect(subscribe(h.db, { email: "nope" })).rejects.toThrow();
  });
});

describe("límite de tasa", () => {
  it("bloquea al superar el límite y se recupera con la ventana", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 1000 + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, 1010);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 1000, 2500).ok).toBe(true);
    expect(rateLimit("otra", 3, 1000, 1010).ok).toBe(true);
  });
});

describe("integridad de la base de datos", () => {
  it("eliminar un artículo elimina su bloque de portada (cascada)", async () => {
    const d = await getHomeData(h.db, NOW);
    const target = d.features[0];
    await h.db.delete(articles).where(eq(articles.id, target.id));
    expect(await h.db.select().from(homeBlocks).where(eq(homeBlocks.articleId, target.id))).toHaveLength(0);
    const after = await getHomeData(h.db, NOW);
    // El hueco se rellena solo con el siguiente artículo más reciente: la portada nunca queda coja.
    expect(after.features.map((f) => f.id)).not.toContain(target.id);
    expect(after.features).toHaveLength(d.features.length);
  });
  it("las fechas de eventos usan timestamptz", async () => {
    const [e] = await h.db.select().from(events).limit(1);
    expect(e.startsAt).toBeInstanceOf(Date);
  });
});
