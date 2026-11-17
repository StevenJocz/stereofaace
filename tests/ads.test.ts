import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { adsTxtFor, getAdsConfig, saveAdsConfig } from "@/modules/settings/ads";
import { canServeAds, parseConsent, serializeConsent, shouldShowBanner } from "@/ui/ads/consent";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let redactor: Actor;
beforeAll(async () => {
  h = await makeDb();
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };
  admin = await mk("admin", "adm");
  redactor = await mk("redactor", "red");
});
afterAll(() => h.close());

const PUB = "ca-pub-1234567890123456";

describe("ajustes de publicidad", () => {
  it("por defecto no hay publicidad", async () => {
    expect(await getAdsConfig(h.db)).toEqual({ enabled: false, publisherId: "", slotHome: "", slotArticle: "" });
  });

  it("solo quien edita ajustes puede guardarlos", async () => {
    await expect(saveAdsConfig(h.db, redactor, { enabled: false, publisherId: "" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("el ID de editor y los espacios deben tener el formato de AdSense", async () => {
    await expect(saveAdsConfig(h.db, admin, { enabled: true, publisherId: "pub-123" })).rejects.toBeInstanceOf(ZodError);
    await expect(saveAdsConfig(h.db, admin, { enabled: true, publisherId: PUB, slotHome: "abc" })).rejects.toBeInstanceOf(ZodError);
  });

  it("activarla exige el ID de editor", async () => {
    await expect(saveAdsConfig(h.db, admin, { enabled: true, publisherId: "" })).rejects.toBeInstanceOf(ZodError);
  });

  it("guarda y devuelve lo configurado", async () => {
    await saveAdsConfig(h.db, admin, { enabled: true, publisherId: PUB, slotHome: "1111111111", slotArticle: "2222222222" });
    expect(await getAdsConfig(h.db)).toEqual({ enabled: true, publisherId: PUB, slotHome: "1111111111", slotArticle: "2222222222" });
  });
});

describe("ads.txt", () => {
  it("autoriza a Google como vendedor directo con el ID de editor", () => {
    expect(adsTxtFor({ enabled: true, publisherId: PUB, slotHome: "", slotArticle: "" })).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n");
  });
  it("sin publicidad activa o sin ID no hay ads.txt", () => {
    expect(adsTxtFor({ enabled: false, publisherId: PUB, slotHome: "", slotArticle: "" })).toBeNull();
    expect(adsTxtFor({ enabled: true, publisherId: "", slotHome: "", slotArticle: "" })).toBeNull();
  });
});

describe("consentimiento de cookies", () => {
  const cfg = { enabled: true, publisherId: PUB, slotHome: "", slotArticle: "" };
  it("sin decisión guardada se pregunta y no se sirven anuncios", () => {
    const c = parseConsent(null);
    expect(c).toEqual({ ads: null });
    expect(shouldShowBanner(cfg, c)).toBe(true);
    expect(canServeAds(cfg, c)).toBe(false);
  });
  it("solo con «aceptar» se sirven anuncios", () => {
    expect(canServeAds(cfg, parseConsent(serializeConsent(true, new Date())))).toBe(true);
    expect(canServeAds(cfg, parseConsent(serializeConsent(false, new Date())))).toBe(false);
  });
  it("una decisión guardada no vuelve a mostrar el aviso", () => {
    expect(shouldShowBanner(cfg, parseConsent(serializeConsent(false, new Date())))).toBe(false);
  });
  it("sin publicidad activa no se pregunta nada ni se sirve nada", () => {
    const off = { ...cfg, enabled: false };
    expect(shouldShowBanner(off, { ads: null })).toBe(false);
    expect(canServeAds(off, { ads: true })).toBe(false);
  });
  it("un valor guardado dañado cuenta como sin decisión", () => {
    expect(parseConsent("no-json")).toEqual({ ads: null });
    expect(parseConsent('{"ads":"si"}')).toEqual({ ads: null });
  });
});
