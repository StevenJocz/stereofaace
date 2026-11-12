import { describe, expect, it } from "vitest";
import { isPublicHost, publicHttpUrlSchema, httpsUrlSchema, slugSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";
import { articleInputSchema } from "@/modules/content/validators";
import { eventInputSchema } from "@/modules/events/validators";
import { embedUrlSchema, releaseInputSchema } from "@/modules/releases/validators";
import { sourceInputSchema } from "@/modules/ingest/validators";
import { artistInputSchema } from "@/modules/artists/validators";
import { subscribeInputSchema } from "@/modules/settings/validators";
import { timeAgoEs, formatAgendaDate } from "@/lib/time";

const uuid = "123e4567-e89b-42d3-a456-426614174000";

describe("slug", () => {
  it("quita acentos y símbolos", () => {
    expect(slugify("¡Qué noche! Techno & Más — 2026")).toBe("que-noche-techno-y-mas-2026");
    expect(slugify("   ")).toBe("");
  });
  it("slugSchema rechaza mayúsculas y guiones dobles", () => {
    expect(slugSchema.safeParse("hola-mundo").success).toBe(true);
    expect(slugSchema.safeParse("Hola").success).toBe(false);
    expect(slugSchema.safeParse("a--b").success).toBe(false);
  });
});

describe("URLs", () => {
  it("rechaza destinos internos (SSRF)", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.5",
      "172.20.1.1",
      "169.254.169.254",
      "foo.internal",
      "[::1]",
    ])
      expect(isPublicHost(h), h).toBe(false);
    for (const h of ["example.com", "8.8.8.8", "172.32.0.1"]) expect(isPublicHost(h), h).toBe(true);
  });
  it("solo http(s) sin credenciales", () => {
    expect(publicHttpUrlSchema.safeParse("https://example.com/feed.xml").success).toBe(true);
    expect(publicHttpUrlSchema.safeParse("http://localhost/feed").success).toBe(false);
    expect(publicHttpUrlSchema.safeParse("https://user:pw@example.com/").success).toBe(false);
    expect(publicHttpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpsUrlSchema.safeParse("http://example.com").success).toBe(false);
  });
});

describe("artículos", () => {
  it("exige fecha futura para programar y la prohíbe en otros estados", () => {
    const future = new Date(Date.now() + 3600_000);
    expect(
      articleInputSchema.safeParse({ title: "Hola mundo", status: "scheduled", scheduledFor: future }).success,
    ).toBe(true);
    expect(articleInputSchema.safeParse({ title: "Hola mundo", status: "scheduled" }).success).toBe(false);
    expect(
      articleInputSchema.safeParse({
        title: "Hola mundo",
        status: "scheduled",
        scheduledFor: new Date(Date.now() - 1000),
      }).success,
    ).toBe(false);
    expect(articleInputSchema.safeParse({ title: "Hola mundo", status: "draft", scheduledFor: future }).success).toBe(
      false,
    );
  });
  it("recorta y valida el título", () => {
    expect(articleInputSchema.safeParse({ title: "  ab  " }).success).toBe(false);
    expect(articleInputSchema.parse({ title: "  Hola  " }).title).toBe("Hola");
  });
});

describe("eventos y lanzamientos", () => {
  const base = { name: "Evento", kind: "rave", startsAt: "2027-01-10T20:00:00Z", city: "Bogotá", country: "CO" };
  it("el fin no puede ser anterior al inicio", () => {
    expect(eventInputSchema.safeParse({ ...base, endsAt: "2027-01-10T23:00:00Z" }).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...base, endsAt: "2027-01-10T10:00:00Z" }).success).toBe(false);
  });
  it("país en ISO mayúsculas y entradas solo por https", () => {
    expect(eventInputSchema.safeParse({ ...base, country: "co" }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, ticketUrl: "http://tickets.example" }).success).toBe(false);
  });
  it("solo reproductores oficiales permitidos", () => {
    expect(embedUrlSchema.safeParse("https://open.spotify.com/embed/album/abc").success).toBe(true);
    expect(embedUrlSchema.safeParse("https://w.soundcloud.com/player/?url=x").success).toBe(true);
    expect(embedUrlSchema.safeParse("https://evil.example/player").success).toBe(false);
    expect(embedUrlSchema.safeParse("https://open.spotify.com.evil.example/x").success).toBe(false);
    expect(
      releaseInputSchema.safeParse({ title: "x", kind: "album", releasedAt: "2027-01-01", artistIds: [] }).success,
    ).toBe(false);
    expect(
      releaseInputSchema.safeParse({ title: "x", kind: "album", releasedAt: "2027-01-01", artistIds: [uuid] }).success,
    ).toBe(true);
  });
  it("enlaces de artista solo https", () => {
    expect(artistInputSchema.safeParse({ name: "A", links: { spotify: "http://x.example" } }).success).toBe(false);
    expect(
      artistInputSchema.safeParse({ name: "A", links: { spotify: "https://open.spotify.com/artist/1" } }).success,
    ).toBe(true);
  });
});

describe("fuentes del motor de noticias", () => {
  const base = { name: "Fuente", kind: "rss", url: "https://example.com/feed.xml" };
  it("nace desactivada y no se activa sin términos verificados", () => {
    expect(sourceInputSchema.parse(base).active).toBe(false);
    expect(sourceInputSchema.safeParse({ ...base, active: true }).success).toBe(false);
    expect(sourceInputSchema.safeParse({ ...base, active: true, termsVerifiedAt: "2026-11-01" }).success).toBe(true);
  });
  it("la publicación automática exige términos verificados", () => {
    expect(sourceInputSchema.safeParse({ ...base, publishPolicy: "autopublish" }).success).toBe(false);
    expect(
      sourceInputSchema.safeParse({ ...base, publishPolicy: "autopublish", termsVerifiedAt: "2026-11-01" }).success,
    ).toBe(true);
  });
  it("rechaza URL internas y frecuencias abusivas", () => {
    expect(sourceInputSchema.safeParse({ ...base, url: "http://127.0.0.1/feed" }).success).toBe(false);
    expect(sourceInputSchema.safeParse({ ...base, intervalMinutes: 1 }).success).toBe(false);
  });
});

describe("newsletter y tiempo", () => {
  it("normaliza el correo", () => {
    expect(subscribeInputSchema.parse({ email: "  Ana@Example.COM " }).email).toBe("ana@example.com");
    expect(subscribeInputSchema.safeParse({ email: "no-es-correo" }).success).toBe(false);
  });
  it("timeAgoEs", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(timeAgoEs(new Date(now.getTime() - 5 * 60_000), now)).toBe("Hace 5 min");
    expect(timeAgoEs(new Date(now.getTime() - 2 * 3600_000), now)).toBe("Hace 2 horas");
    expect(timeAgoEs(new Date(now.getTime() - 25 * 3600_000), now)).toBe("Ayer");
    expect(formatAgendaDate(new Date("2026-11-21T05:00:00Z"))).toBe("NOV 21");
  });
});
