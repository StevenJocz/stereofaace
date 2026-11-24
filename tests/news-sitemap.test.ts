import { describe, expect, it } from "vitest";
import { buildNewsSitemap } from "@/lib/news-sitemap";

describe("sitemap de noticias", () => {
  it("incluye noticias editoriales recientes, escapa XML y excluye noindex, importaciones y notas antiguas", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const base = { slug: "nota", title: "Rock & electrónica <en vivo>", createdAt: now, publishedAt: now, seo: {}, origin: "manual" as const, isDemo: false };
    const xml = buildNewsSitemap([
      base,
      { ...base, slug: "oculta", seo: { noindex: true } },
      { ...base, slug: "importada", origin: "imported" },
      { ...base, slug: "antigua", createdAt: new Date("2026-11-21T12:00:00Z") },
      { ...base, slug: "demo", isDemo: true },
      { ...base, slug: "externa", seo: { canonical: "https://otra.example/nota" } },
    ], "https://stereoface.online", now);
    expect(xml).toContain("https://stereoface.online/noticias/nota");
    expect(xml).toContain("Rock &amp; electrónica &lt;en vivo&gt;");
    expect(xml).not.toContain("/noticias/oculta");
    expect(xml).not.toContain("/noticias/importada");
    expect(xml).not.toContain("/noticias/antigua");
    expect(xml).not.toContain("/noticias/demo");
    expect(xml).not.toContain("/noticias/externa");
  });
});
