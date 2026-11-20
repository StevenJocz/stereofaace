import { describe, expect, it } from "vitest";
import { DEFAULT_THEMES } from "@/modules/spaces/defaults";
import { BLOCK_IDS, COVER_IDS, contrast, designSchema, designVars, normalizeDesign, orderedBlocks, parseSpotify, parseYouTube, safeUrl, spotifyEmbedSrc, spotifyHref, spotifyUriToUrl, youtubeEmbedSrc, type SpaceDesign } from "@/modules/spaces/design";

const ok = () => structuredClone(DEFAULT_THEMES[0].design) as SpaceDesign;
const bad = (mut: (d: Record<string, unknown>) => void) => {
  const d = ok() as unknown as Record<string, unknown>;
  mut(d);
  return designSchema.safeParse(d);
};

describe("plantillas iniciales", () => {
  it("son veinte, las cinco originales primero, y todas pasan la validación (incluida la legibilidad)", () => {
    const slugs = DEFAULT_THEMES.map((t) => t.slug);
    expect(slugs).toHaveLength(20);
    expect(new Set(slugs).size).toBe(20);
    expect(slugs.slice(0, 5)).toEqual(["underground-techno", "neon-rave", "indie-alternative", "acid-house", "minimal-dark"]);
    for (const t of DEFAULT_THEMES) {
      const r = designSchema.safeParse(t.design);
      expect(r.success, `${t.slug}: ${r.success ? "" : r.error.message}`).toBe(true);
      expect(t.design.theme, t.slug).toBe(t.slug);
    }
  });
  it("cada plantilla trae una portada prediseñada válida y las portadas no se agotan en una sola", () => {
    for (const t of DEFAULT_THEMES) expect(COVER_IDS, t.slug).toContain(t.design.cover);
    expect(new Set(DEFAULT_THEMES.map((t) => t.design.cover)).size).toBeGreaterThanOrEqual(12);
    expect(bad((d) => (d.cover = "url(javascript:alert(1))")).success).toBe(false);
    expect(bad((d) => (d.cover = "no-existe")).success).toBe(false);
    expect(bad((d) => (d.cover = null)).success).toBe(true);
  });
  it("un diseño guardado sin portada sigue siendo válido y se completa al leerlo", () => {
    const old = ok() as unknown as Record<string, unknown>;
    delete old.cover;
    expect(designSchema.safeParse(old).success).toBe(true);
    expect(normalizeDesign(old as unknown as SpaceDesign).cover).toBeNull();
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

describe("Spotify y YouTube incrustados", () => {
  const ID = "37i9dQZF1DXcBWIGoYBM5M"; // 22 caracteres
  const withPlayer = (patch: Record<string, unknown>) => bad((d) => Object.assign(d.player as Record<string, unknown>, patch));

  it("acepta perfil de artista/usuario, playlist y videos de YouTube en sus formas habituales", () => {
    expect(withPlayer({ spotify: { profile: `https://open.spotify.com/artist/${ID}?si=abc`, playlist: `https://open.spotify.com/intl-es/playlist/${ID}` }, videos: ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?t=3", "https://youtube.com/shorts/dQw4w9WgXcQ"] }).success).toBe(true);
    expect(withPlayer({ spotify: { profile: "https://open.spotify.com/user/mi.usuario_123", playlist: null } }).success).toBe(true);
  });
  it("un diseño guardado antes de existir estos campos sigue siendo válido y se completa al leerlo", () => {
    const old = ok() as unknown as { player: Record<string, unknown> };
    delete old.player.spotify;
    delete old.player.videos;
    expect(designSchema.safeParse(old).success).toBe(true);
    const n = normalizeDesign(old as unknown as SpaceDesign);
    expect(n.player.spotify).toEqual({ profile: null, playlist: null });
    expect(n.player.videos).toEqual([]);
  });
  it("rechaza hosts falsos, http, playlist donde va perfil, ids raros y más de 3 videos", () => {
    for (const profile of [`https://open.spotify.com.evil.io/artist/${ID}`, `http://open.spotify.com/artist/${ID}`, `https://open.spotify.com/playlist/${ID}`, "https://open.spotify.com/artist/corto", `https://open.spotify.com/artist/${ID}/../x"onload=alert(1)`, "https://spotify.link/abc"]) {
      expect(withPlayer({ spotify: { profile, playlist: null } }).success, profile).toBe(false);
    }
    expect(withPlayer({ spotify: { profile: null, playlist: `https://open.spotify.com/artist/${ID}` } }).success).toBe(false);
    for (const v of ["https://youtube.com.evil.io/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=corto", "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"onload=x", "https://www.youtube.com/results?search_query=x", "javascript:alert(1)"]) {
      expect(withPlayer({ videos: [v] }).success, v).toBe(false);
    }
    const v = "https://youtu.be/dQw4w9WgXcQ";
    expect(withPlayer({ videos: [v, v, v, v] }).success).toBe(false);
  });
  it("el iframe se construye solo desde ids validados (nunca desde el texto de la persona)", () => {
    expect(parseYouTube("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x")).toBe("dQw4w9WgXcQ");
    expect(youtubeEmbedSrc("dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    const art = parseSpotify(`https://open.spotify.com/artist/${ID}?si=zzz`, ["artist"])!;
    expect(spotifyEmbedSrc(art)).toBe(`https://open.spotify.com/embed/artist/${ID}`);
    const user = parseSpotify("https://open.spotify.com/user/yo", ["user"])!;
    expect(spotifyEmbedSrc(user)).toBeNull(); // los perfiles de usuario van como enlace
    expect(spotifyHref(user)).toBe("https://open.spotify.com/user/yo");
  });
});

describe("spotifyUriToUrl", () => {
  it("convierte el URI de la app en el enlace web y deja el resto igual", () => {
    expect(spotifyUriToUrl("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    expect(spotifyUriToUrl("  spotify:album:4uLU6hMCjMI75M1A2tKUQC ")).toBe("https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC");
    expect(spotifyUriToUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x")).toBe("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x");
    expect(spotifyUriToUrl("spotify:track:../../evil")).toBe("spotify:track:../../evil");
  });
  it("el resultado pasa por parseSpotify", () => {
    expect(parseSpotify(spotifyUriToUrl("spotify:track:4uLU6hMCjMI75M1A2tKUQC"), ["track"])).toEqual({ kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC" });
  });
});
