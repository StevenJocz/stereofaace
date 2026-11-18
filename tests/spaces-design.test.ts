import { describe, expect, it } from "vitest";
import { DEFAULT_THEMES } from "@/modules/spaces/defaults";
import { BLOCK_IDS, contrast, designSchema, designVars, orderedBlocks, safeUrl, type SpaceDesign } from "@/modules/spaces/design";

const ok = () => structuredClone(DEFAULT_THEMES[0].design) as SpaceDesign;
const bad = (mut: (d: Record<string, unknown>) => void) => {
  const d = ok() as unknown as Record<string, unknown>;
  mut(d);
  return designSchema.safeParse(d);
};

describe("plantillas iniciales", () => {
  it("son cinco y todas pasan la validación (incluida la legibilidad)", () => {
    expect(DEFAULT_THEMES.map((t) => t.slug)).toEqual(["underground-techno", "neon-rave", "indie-alternative", "acid-house", "minimal-dark"]);
    for (const t of DEFAULT_THEMES) expect(designSchema.safeParse(t.design).success, t.slug).toBe(true);
  });
});

describe("validación del diseño (nada de HTML, JavaScript ni CSS libre)", () => {
  it("rechaza colores que no son #rrggbb (por ejemplo, intentos de inyectar CSS)", () => {
    for (const v of ["red", "#fff", "#ggg000", "#000000; background:url(x)", "url(javascript:alert(1))", "#00000080"]) {
      expect(bad((d) => ((d.colors as Record<string, string>).bg = v)).success, v).toBe(false);
    }
  });
  it("rechaza claves desconocidas (no se puede colar CSS, HTML ni scripts) y fuentes o fondos fuera de la lista", () => {
    expect(bad((d) => (d.customCss = "body{display:none}")).success).toBe(false);
    expect(bad((d) => ((d.colors as Record<string, string>).extra = "#000000")).success).toBe(false);
    expect(bad((d) => ((d.font as Record<string, unknown>).heading = "Comic Sans; } body {")).success).toBe(false);
    expect(bad((d) => ((d.background as Record<string, unknown>).gradient = "linear-gradient(red, blue)")).success).toBe(false);
    expect(bad((d) => (d.blocks = [{ id: "script", visible: true }])).success).toBe(false);
  });
  it("acota números y largos", () => {
    expect(bad((d) => (d.cardOpacity = 5)).success).toBe(false);
    expect(bad((d) => ((d.border as Record<string, number>).radius = 99)).success).toBe(false);
    expect(bad((d) => ((d.font as Record<string, number>).scale = 300)).success).toBe(false);
    expect(bad((d) => (d.quote = "x".repeat(201))).success).toBe(false);
    expect(bad((d) => (d.quote = "con\u0000control")).success).toBe(false);
  });
  it("los bloques no se repiten ni faltan", () => {
    expect(bad((d) => (d.blocks = BLOCK_IDS.map(() => ({ id: "about", visible: true })))).success).toBe(false);
    expect(bad((d) => (d.blocks = (d.blocks as unknown[]).slice(1))).success).toBe(false);
  });
  it("la imagen de fondo exige un archivo; un id que no es uuid se rechaza", () => {
    expect(bad((d) => ((d.background as Record<string, unknown>).kind = "image")).success).toBe(false);
    expect(bad((d) => Object.assign(d.background as object, { kind: "image", assetId: "../../etc/passwd" })).success).toBe(false);
    expect(bad((d) => Object.assign(d.background as object, { kind: "image", assetId: "6b1a4e0e-3f0a-4a3b-8f6e-0c9d2b7a1e55" })).success).toBe(true);
  });
  it("exige contraste: texto sobre las tarjetas y enlaces legibles", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 0);
    const r = bad((d) => Object.assign(d.colors as object, { text: "#202020", card: "#141416", bg: "#0b0b0c" }));
    expect(r.success).toBe(false);
    expect(bad((d) => Object.assign(d.colors as object, { link: "#101010" })).success).toBe(false);
  });
  it("los enlaces de música son https de dominios permitidos y sin credenciales", () => {
    const withSong = (url: string) => bad((d) => ((d.player as Record<string, unknown>).song = { title: "t", artist: "a", url }));
    expect(withSong("https://open.spotify.com/track/abc").success).toBe(true);
    for (const u of ["http://open.spotify.com/x", "javascript:alert(1)", "https://evil.example/x", "https://user:pw@open.spotify.com/x", "https://spotify.com.evil.io/x", "data:text/html,<script>"]) {
      expect(withSong(u).success, u).toBe(false);
    }
    expect(safeUrl("https://mi-sitio.com/perfil", null)).toBe("https://mi-sitio.com/perfil");
    expect(safeUrl("https://localhost/x", null)).toBeNull();
  });
});

describe("render: diseño → variables CSS", () => {
  it("solo produce valores controlados y ordena los bloques por columna", () => {
    const d = ok();
    d.blocks = [...d.blocks].reverse();
    const vars = designVars(d, null);
    for (const [k, v] of Object.entries(vars)) {
      expect(k.startsWith("--sp-")).toBe(true);
      expect(v).not.toMatch(/[;{}<>]|javascript:|expression\(/i);
    }
    expect(orderedBlocks(d, "main")[0]).toBe("musicinfo");
    expect(orderedBlocks(d, "side")).toEqual(["links", "gallery", "player"]);
  });
  it("la imagen de fondo viene de una ruta interna con comillas escapadas por construcción", () => {
    const d = ok();
    Object.assign(d.background, { kind: "image", assetId: "6b1a4e0e-3f0a-4a3b-8f6e-0c9d2b7a1e55" });
    expect(designVars(d, "/s/6b1a4e0e-3f0a-4a3b-8f6e-0c9d2b7a1e55")["--sp-bg-image"]).toContain('url("/s/6b1a4e0e-3f0a-4a3b-8f6e-0c9d2b7a1e55")');
  });
});
