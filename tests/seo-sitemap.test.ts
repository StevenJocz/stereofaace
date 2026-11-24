import { describe, expect, it } from "vitest";
import { includeInSitemap } from "@/lib/seo";
import { articleInputSchema } from "@/modules/content/validators";

describe("indexabilidad en sitemap", () => {
  const url = "https://stereoface.online/noticias/una-nota";
  it("incluye las páginas indexables que son su propia canonical", () => {
    expect(includeInSitemap({}, url)).toBe(true);
    expect(includeInSitemap({ canonical: url }, url)).toBe(true);
  });
  it("excluye noindex y canonical hacia otra página", () => {
    expect(includeInSitemap({ noindex: true }, url)).toBe(false);
    expect(includeInSitemap({ canonical: "https://otra.example/nota" }, url)).toBe(false);
  });
});

describe("URLs SEO de artículos", () => {
  it("rechaza protocolos no seguros para canonical e imagen social", () => {
    expect(articleInputSchema.safeParse({ title: "Una nota", seo: { canonical: "javascript:alert(1)" } }).success).toBe(false);
    expect(articleInputSchema.safeParse({ title: "Una nota", seo: { ogImage: "ftp://example.com/image.jpg" } }).success).toBe(false);
    expect(articleInputSchema.safeParse({ title: "Una nota", seo: { canonical: "https://example.com/nota", ogImage: "https://example.com/imagen.jpg" } }).success).toBe(true);
  });
});
