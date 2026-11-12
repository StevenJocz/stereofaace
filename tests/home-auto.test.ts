import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { articles, categories, homeBlocks } from "@/db/schema";
import { FEATURE_SIZE, HERO_SIZE, getHomeData } from "@/modules/content/service";
import { makeDb } from "./helpers";

let h: DbHandle;
const NOW = new Date("2026-11-12T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000);

async function add(slug: string, daysAgo: number, opts: { photo?: boolean; status?: "published" | "draft"; cat?: string } = {}) {
  const [cat] = opts.cat ? await h.db.select().from(categories).where(eq(categories.slug, opts.cat)) : [undefined];
  const [a] = await h.db
    .insert(articles)
    .values({
      slug,
      title: `Título ${slug}`,
      status: opts.status ?? "published",
      publishedAt: day(daysAgo),
      coverUrl: opts.photo === false ? null : `https://example.org/${slug}.jpg`,
      categoryId: cat?.id,
    })
    .returning();
  return a.id;
}

beforeAll(async () => {
  h = await makeDb();
  await h.db.insert(categories).values([{ slug: "electronica", name: "Electrónica" }, { slug: "indie", name: "Indie" }]);
  // 14 artículos: del más reciente (a01) al más antiguo (a14). a02 y a03 no tienen foto.
  for (let i = 1; i <= 14; i++) await add(`a${String(i).padStart(2, "0")}`, i, { photo: i !== 2 && i !== 3, cat: i % 2 ? "electronica" : "indie" });
  await add("borrador", 0, { status: "draft" });
});
afterAll(async () => {
  await h.close();
});

const slugs = (xs: { slug: string }[]) => xs.map((x) => x.slug);

describe("portada automática", () => {
  it("la portada toma los más recientes con foto y los destacados, los siguientes más recientes", async () => {
    const d = await getHomeData(h.db, NOW);
    expect(d.hero).toHaveLength(HERO_SIZE);
    expect(slugs(d.hero)).toEqual(["a01", "a04", "a05", "a06"]); // a02 y a03 no tienen foto
    expect(d.features).toHaveLength(FEATURE_SIZE);
    expect(slugs(d.features)).toEqual(["a02", "a03", "a07", "a08"]);
  });

  it("ningún artículo se repite entre portada, destacados y el resto de secciones", async () => {
    const d = await getHomeData(h.db, NOW);
    const all = [...d.hero, ...d.features, ...d.recent, ...d.latest, ...d.electronica, ...d.indie].map((s) => s.slug);
    // Las secciones por categoría pueden repetirse entre sí, pero no con portada ni destacados.
    const top = new Set([...d.hero, ...d.features].map((s) => s.slug));
    for (const s of [...d.recent, ...d.latest, ...d.electronica, ...d.indie]) expect(top.has(s.slug)).toBe(false);
    expect(new Set([...d.hero, ...d.features].map((s) => s.slug)).size).toBe(HERO_SIZE + FEATURE_SIZE);
    expect(all).not.toContain("borrador");
  });

  it("cada slide automático trae datos de presentación sin que nadie los escriba", async () => {
    const [first] = (await getHomeData(h.db, NOW)).hero;
    expect(first.config.cta).toBeTruthy();
    expect(first.config.place).toBeTruthy();
    expect(first.config.path).toHaveLength(3);
  });

  it("un artículo futuro o en borrador nunca entra", async () => {
    await add("futuro", -3);
    const d = await getHomeData(h.db, NOW);
    const all = [...d.hero, ...d.features].map((s) => s.slug);
    expect(all).not.toContain("futuro");
    expect(all).not.toContain("borrador");
  });

  it("un artículo fijado a mano va primero y no se repite en los destacados", async () => {
    const pinned = (await h.db.select().from(articles).where(eq(articles.slug, "a12")))[0];
    await h.db.insert(homeBlocks).values({ kind: "hero", position: 0, articleId: pinned.id, config: { lines: [], accentFrom: 0 } });
    const d = await getHomeData(h.db, NOW);
    expect(d.hero[0].slug).toBe("a12");
    expect(d.hero).toHaveLength(HERO_SIZE);
    const heroSlugs = slugs(d.hero);
    expect(new Set(heroSlugs).size).toBe(HERO_SIZE);
    for (const f of d.features) expect(heroSlugs).not.toContain(f.slug);
    await h.db.delete(homeBlocks);
  });

  it("con pocos artículos no falla ni repite", async () => {
    const small = await makeDb();
    try {
      const [a] = await small.db.insert(articles).values({ slug: "unico", title: "Único", status: "published", publishedAt: day(1) }).returning();
      const d = await getHomeData(small.db, NOW);
      expect(d.hero.map((x) => x.id)).toEqual([a.id]);
      expect(d.features).toEqual([]);
    } finally {
      await small.close();
    }
  });
});
