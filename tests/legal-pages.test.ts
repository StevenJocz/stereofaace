import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { pages } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { LEGAL_PAGES } from "@/db/legal-pages";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { getPublishedPage } from "@/modules/content/pages-admin";
import { makeDb } from "./helpers";

let h: DbHandle;
beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
});
afterAll(() => h.close());

describe("páginas legales base", () => {
  it("quedan publicadas las cinco que pide un sitio con publicidad", async () => {
    for (const slug of ["privacidad", "cookies", "terminos", "sobre-nosotros", "contacto"]) {
      const p = await getPublishedPage(h.db, slug);
      expect(p, slug).not.toBeNull();
      expect((p!.bodyHtml ?? "").length).toBeGreaterThan(300);
    }
  });

  it("el texto sobrevive al saneado del sitio (títulos, listas y enlaces)", () => {
    for (const p of LEGAL_PAGES) {
      const clean = sanitizeArticleHtml(p.html);
      expect(clean, p.slug).toContain("<h2>");
      expect(clean, p.slug).toContain("<p>");
      expect(clean, p.slug).toMatch(/href="(\/pagina\/[a-z-]+|https:\/\/[^"]+)"/);
    }
  });

  it("las páginas hablan de los temas obligatorios (datos, cookies, publicidad de terceros)", () => {
    const by = Object.fromEntries(LEGAL_PAGES.map((p) => [p.slug, p.html]));
    expect(by.privacidad).toContain("Ley 1581");
    expect(by.privacidad).toMatch(/AdSense/);
    expect(by.cookies).toMatch(/hasta que las aceptes/);
    expect(by.contacto).toContain("facebook.com/StereofaceVIP");
  });

  it("cargarlas otra vez no duplica ni pisa lo que el administrador editó", async () => {
    await h.db.update(pages).set({ title: "Privacidad editada", bodyHtml: "<p>Texto propio</p>" }).where(and(eq(pages.locale, "es"), eq(pages.slug, "privacidad")));
    await seedBase(h.db);
    const all = await h.db.select({ slug: pages.slug }).from(pages);
    expect(all.filter((r) => r.slug === "privacidad")).toHaveLength(1);
    const p = await getPublishedPage(h.db, "privacidad");
    expect(p).toMatchObject({ title: "Privacidad editada", bodyHtml: "<p>Texto propio</p>" });
  });
});
