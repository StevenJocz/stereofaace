import { BLOCK_IDS, type SpaceDesign } from "./design";

const blocks = (hidden: string[] = []): SpaceDesign["blocks"] => BLOCK_IDS.map((id) => ({ id, visible: !hidden.includes(id) }));

const base = (over: Partial<SpaceDesign> & Pick<SpaceDesign, "theme" | "colors">): SpaceDesign => ({
  v: 1,
  cardOpacity: 85,
  border: { width: 1, radius: 14, color: "#2e2e36" },
  background: { kind: "gradient", gradient: "noche", assetId: null, position: "center", size: "cover", fixed: true, overlay: 40 },
  font: { heading: "archivo", body: "sistema", scale: 100 },
  blocks: blocks(),
  player: { showRadio: true, song: null, links: [], spotify: { profile: null, playlist: null }, videos: [] },
  quote: "",
  musicinfo: { favoriteSong: "", favoriteArtist: "", since: "", scene: "" },
  ...over,
});

/** Las cinco plantillas iniciales de StereoFace Spaces. La persona puede modificarlas después. */
export const DEFAULT_THEMES: { slug: string; name: string; description: string; design: SpaceDesign }[] = [
  {
    slug: "underground-techno",
    name: "Underground Techno",
    description: "Negro, gris y acentos industriales.",
    design: base({
      theme: "underground-techno",
      colors: { bg: "#0b0b0c", primary: "#c6ff00", secondary: "#8a8a92", text: "#efefea", link: "#c6ff00", card: "#141416" },
      border: { width: 1, radius: 4, color: "#3a3a40" },
      background: { kind: "gradient", gradient: "industrial", assetId: null, position: "center", size: "cover", fixed: true, overlay: 40 },
      font: { heading: "impacto", body: "mono", scale: 100 },
    }),
  },
  {
    slug: "neon-rave",
    name: "Neon Rave",
    description: "Negro, violeta y efectos neón.",
    design: base({
      theme: "neon-rave",
      colors: { bg: "#08050f", primary: "#c04cff", secondary: "#ff3dbd", text: "#f4ecff", link: "#ff7ad9", card: "#150a26" },
      cardOpacity: 80,
      border: { width: 1, radius: 16, color: "#6a2fb0" },
      background: { kind: "gradient", gradient: "neon", assetId: null, position: "center", size: "cover", fixed: true, overlay: 40 },
      font: { heading: "archivo-wide", body: "sistema", scale: 100 },
    }),
  },
  {
    slug: "indie-alternative",
    name: "Indie Alternative",
    description: "Estética editorial, texturas y colores alternativos.",
    design: base({
      theme: "indie-alternative",
      colors: { bg: "#1b1214", primary: "#f2a65a", secondary: "#c97b84", text: "#f7efe6", link: "#f2a65a", card: "#2a1c1f" },
      border: { width: 1, radius: 10, color: "#5a3a3f" },
      background: { kind: "gradient", gradient: "amanecer", assetId: null, position: "center", size: "cover", fixed: false, overlay: 40 },
      font: { heading: "serif", body: "serif", scale: 105 },
    }),
  },
  {
    slug: "acid-house",
    name: "Acid House",
    description: "Colores ácidos y estética rave.",
    design: base({
      theme: "acid-house",
      colors: { bg: "#0c1200", primary: "#d4ff00", secondary: "#ff4d00", text: "#f6ffd6", link: "#d4ff00", card: "#18220a" },
      cardOpacity: 90,
      border: { width: 2, radius: 0, color: "#d4ff00" },
      background: { kind: "gradient", gradient: "acido", assetId: null, position: "center", size: "cover", fixed: true, overlay: 40 },
      font: { heading: "impacto", body: "archivo", scale: 100 },
    }),
  },
  {
    slug: "minimal-dark",
    name: "Minimal Dark",
    description: "Diseño oscuro, elegante y minimalista.",
    design: base({
      theme: "minimal-dark",
      colors: { bg: "#0a0a0a", primary: "#e8e8e8", secondary: "#7a7a7a", text: "#e6e6e6", link: "#ffffff", card: "#121212" },
      cardOpacity: 70,
      border: { width: 1, radius: 12, color: "#262626" },
      background: { kind: "color", gradient: "noche", assetId: null, position: "center", size: "cover", fixed: false, overlay: 40 },
      font: { heading: "archivo", body: "archivo", scale: 100 },
      blocks: blocks(["quote", "musicinfo"]),
    }),
  },
];

export const DEFAULT_GENRE_OPTIONS: [string, string][] = [
  ["techno", "Techno"],
  ["melodic-techno", "Melodic Techno"],
  ["progressive-house", "Progressive House"],
  ["deep-house", "Deep House"],
  ["tech-house", "Tech House"],
  ["house", "House"],
  ["trance", "Trance"],
  ["drum-and-bass", "Drum & Bass"],
  ["indie-rock", "Indie Rock"],
  ["alternative-rock", "Alternative Rock"],
  ["post-punk", "Post-Punk"],
  ["shoegaze", "Shoegaze"],
  ["synthwave", "Synthwave"],
  ["ambient", "Ambient"],
  ["experimental", "Experimental"],
  ["electronica", "Electrónica"],
];
