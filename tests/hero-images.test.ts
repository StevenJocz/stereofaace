import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { HeroSlider, type HeroSlideView } from "@/ui/HeroSlider";

describe("imágenes del carrusel", () => {
  it("prioriza la primera portada y difiere las restantes", () => {
    const item: HeroSlideView = { id: "1", path: ["Música", "Cultura", "Escena"], lines: ["Titular"], accentFrom: 0, dek: "Bajada", tone: "acid", art: "grid", seed: 1, coverUrl: "https://example.com/uno.jpg", cta: "Leer", href: "/noticias/uno", meta: "", place: "Colombia", isDemo: false };
    const html = renderToStaticMarkup(createElement(HeroSlider, { slides: [item, { ...item, id: "2", coverUrl: "https://example.com/dos.jpg" }] }));
    expect(html).toMatch(/<img[^>]*src="https:\/\/example.com\/uno.jpg"[^>]*fetchPriority="high"/i);
    expect(html).toMatch(/<img[^>]*src="https:\/\/example.com\/dos.jpg"[^>]*loading="lazy"/i);
  });

  it("entrega imágenes propias en tamaños adaptables", () => {
    const item: HeroSlideView = { id: "1", path: ["Música", "Cultura", "Escena"], lines: ["Titular"], accentFrom: 0, dek: "Bajada", tone: "acid", art: "grid", seed: 1, coverUrl: "/media/f9d9423b-82c7-4c5d-a478-5b55a807ce65", cta: "Leer", href: "/noticias/uno", meta: "", place: "Colombia", isDemo: false };
    const html = renderToStaticMarkup(createElement(HeroSlider, { slides: [item] }));
    expect(html).toContain("/_next/image?");
    expect(html).toContain("srcSet=");
    expect(html).toContain("fetchPriority=\"high\"");
  });
});
