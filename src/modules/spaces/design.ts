import { z } from "zod";

/**
 * Diseño de un Space: configuración ESTRUCTURADA y validada. Nunca se guarda HTML, JavaScript ni CSS escrito por la persona:
 * los colores son #rrggbb, las fuentes y los fondos prediseñados salen de listas cerradas, y los enlaces son https de dominios permitidos.
 * El render lo convierte en variables CSS dentro del propio perfil, así que no puede afectar al resto de la plataforma.
 */

export const FONTS = [
  { id: "archivo", name: "Archivo (StereoFace)", stack: "var(--font-archivo), system-ui, sans-serif" },
  { id: "archivo-wide", name: "Archivo ancha", stack: "var(--font-archivo), system-ui, sans-serif", stretch: true },
  { id: "mono", name: "JetBrains Mono", stack: "var(--font-jetbrains), ui-monospace, monospace" },
  { id: "serif", name: "Newsreader (editorial)", stack: "var(--font-newsreader), Georgia, serif" },
  { id: "sistema", name: "Sistema (limpia)", stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "impacto", name: "Impacto (cartel)", stack: "'Arial Black', 'Helvetica Neue', Impact, sans-serif" },
] as const;
export type FontId = (typeof FONTS)[number]["id"];
export const FONT_IDS = FONTS.map((f) => f.id) as [FontId, ...FontId[]];

/** Fondos prediseñados (CSS fijo del código: la persona solo elige el id). */
export const GRADIENTS = [
  { id: "noche", name: "Noche", css: "linear-gradient(160deg, #0a0a0c 0%, #1a1a22 100%)" },
  { id: "neon", name: "Neón", css: "radial-gradient(120% 90% at 80% 0%, #4b1d8c 0%, #120a22 55%, #07050d 100%)" },
  { id: "acido", name: "Ácido", css: "linear-gradient(135deg, #0c1200 0%, #243300 60%, #394f00 100%)" },
  { id: "industrial", name: "Industrial", css: "linear-gradient(180deg, #141414 0%, #232323 50%, #0d0d0d 100%)" },
  { id: "amanecer", name: "Amanecer indie", css: "linear-gradient(160deg, #2a1d1a 0%, #4a2a26 55%, #1b1214 100%)" },
  { id: "ocaso", name: "Ocaso", css: "linear-gradient(160deg, #1b1030 0%, #5a1d4a 60%, #1a0a14 100%)" },
] as const;
export type GradientId = (typeof GRADIENTS)[number]["id"];
export const GRADIENT_IDS = GRADIENTS.map((g) => g.id) as [GradientId, ...GradientId[]];

/** Portadas prediseñadas (CSS fijo del código: la persona solo elige el id; usan los colores de su diseño). */
export const COVERS = [
  { id: "topo", name: "Topográfica" },
  { id: "grid", name: "Cuadrícula" },
  { id: "rings", name: "Anillos" },
  { id: "stripes", name: "Rayas" },
  { id: "sunset", name: "Atardecer retro" },
  { id: "dots", name: "Semitono" },
  { id: "waves", name: "Ondas" },
  { id: "beams", name: "Rayos" },
  { id: "scan", name: "Escáner" },
  { id: "aurora", name: "Aurora" },
  { id: "checker", name: "Ajedrez" },
  { id: "bars", name: "Ecualizador" },
  { id: "noise", name: "Grano" },
  { id: "diamonds", name: "Rombos" },
  { id: "spot", name: "Focos de escenario" },
] as const;
export type CoverId = (typeof COVERS)[number]["id"];
export const COVER_IDS = COVERS.map((c) => c.id) as [CoverId, ...CoverId[]];

export const BLOCK_IDS = ["about", "genres", "artists", "player", "gallery", "links", "quote", "musicinfo"] as const;
export type BlockId = (typeof BLOCK_IDS)[number];
export const BLOCK_LABEL: Record<BlockId, string> = {
  about: "Sobre mí",
  genres: "Géneros favoritos",
  artists: "Artistas / DJs favoritos",
  player: "Reproductor",
  gallery: "Galería",
  links: "Enlaces",
  quote: "Frase",
  musicinfo: "Información musical",
};
/** Columna fija de cada bloque (el orden dentro de la columna lo decide la persona). */
export const BLOCK_COLUMN: Record<BlockId, "main" | "side"> = { about: "main", genres: "main", artists: "main", quote: "main", musicinfo: "main", player: "side", gallery: "side", links: "side" };

/** Dominios de música para el bloque del reproductor. */
export const MUSIC_HOSTS = ["spotify.com", "soundcloud.com", "youtube.com", "youtu.be", "bandcamp.com", "mixcloud.com", "tidal.com", "deezer.com", "music.apple.com"];
/** Redes y sitios para los enlaces personales. */
export const SOCIAL_HOSTS = ["instagram.com", "x.com", "twitter.com", "tiktok.com", "facebook.com", "youtube.com", "youtu.be", "spotify.com", "soundcloud.com", "bandcamp.com", "mixcloud.com", "linktr.ee"];

function hostOk(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((a) => h === a || h.endsWith(`.${a}`));
}

/** URL https sin credenciales ni puertos raros, de un dominio permitido (o de cualquiera si `allowed` es null). */
export function safeUrl(raw: string, allowed: string[] | null): string | null {
  if (raw.length > 300) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  if (allowed && !hostOk(u.hostname, allowed)) return null;
  if (!allowed && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
  return u.toString();
}
export const musicUrl = z.string().trim().refine((v) => safeUrl(v, MUSIC_HOSTS) !== null, "Usa un enlace https de Spotify, SoundCloud, YouTube, Bandcamp, Mixcloud, Tidal, Deezer o Apple Music.");

/* ───────────── Spotify y YouTube (incrustados) ───────────── */

export type SpotifyKind = "artist" | "user" | "playlist" | "album" | "track" | "show" | "episode";
export type SpotifyRef = { kind: SpotifyKind; id: string };

/**
 * Lee un enlace de open.spotify.com y devuelve el tipo y el id. Del enlace de la persona NUNCA se usa el texto: el iframe se
 * construye siempre desde estos dos valores ya validados (id de 22 caracteres para artista/playlist; nombre de usuario para perfiles).
 */
export function parseSpotify(raw: string, kinds: SpotifyKind[]): SpotifyRef | null {
  const href = safeUrl(raw, ["open.spotify.com"]);
  if (!href) return null;
  const u = new URL(href);
  if (u.hostname.toLowerCase() !== "open.spotify.com") return null;
  const seg = u.pathname.split("/").filter(Boolean);
  if (seg[0] && /^intl-[a-z]{2}(-[a-z]{2})?$/i.test(seg[0])) seg.shift();
  if (seg[0] === "embed") seg.shift(); // también acepta el enlace de «insertar» de Spotify
  const [kind, id] = seg;
  if (!kind || !id || !kinds.includes(kind as SpotifyKind)) return null;
  if (kind === "user" ? !/^[A-Za-z0-9._~-]{1,64}$/.test(id) : !/^[A-Za-z0-9]{22}$/.test(id)) return null;
  return { kind: kind as SpotifyKind, id };
}
/** Convierte un URI de la app de Spotify (`spotify:track:<id>`) en su enlace web; cualquier otro texto se devuelve igual. */
export const spotifyUriToUrl = (raw: string): string => {
  const m = /^spotify:(artist|user|playlist|album|track|show|episode):([A-Za-z0-9._~-]{1,64})$/i.exec(raw.trim());
  return m ? `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}` : raw;
};
/** Los perfiles de usuario no tienen reproductor incrustable: se muestran como enlace. */
export const spotifyEmbedSrc = (r: SpotifyRef): string | null => (r.kind === "user" ? null : `https://open.spotify.com/embed/${r.kind}/${r.id}`);
export const spotifyHref = (r: SpotifyRef): string => `https://open.spotify.com/${r.kind}/${r.id}`;

/** Id de un video de YouTube (watch, youtu.be, shorts, embed o live). */
export function parseYouTube(raw: string): string | null {
  const href = safeUrl(raw, ["youtube.com", "youtu.be"]);
  if (!href) return null;
  const u = new URL(href);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const seg = u.pathname.split("/").filter(Boolean);
  const id = host === "youtu.be" ? seg[0] : u.pathname === "/watch" ? u.searchParams.get("v") : ["shorts", "embed", "live"].includes(seg[0] ?? "") ? seg[1] : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export const youtubeEmbedSrc = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0`;

const spotifyProfileUrl = z.string().trim().refine((v) => parseSpotify(v, ["artist", "user"]) !== null, "Usa el enlace de tu perfil de artista o de usuario de Spotify (open.spotify.com/artist/… o /user/…).");
const spotifyPlaylistUrl = z.string().trim().refine((v) => parseSpotify(v, ["playlist"]) !== null, "Usa el enlace de una playlist de Spotify (open.spotify.com/playlist/…).");
const youtubeUrl = z.string().trim().refine((v) => parseYouTube(v) !== null, "Usa el enlace de un video de YouTube (youtube.com/watch?v=… o youtu.be/…).");

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Usa un color #rrggbb");
const text = (max: number) => z.string().trim().max(max).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Texto no válido");

const blockSchema = z.object({ id: z.enum(BLOCK_IDS), visible: z.boolean() }).strict();

export const designSchema = z
  .object({
    v: z.literal(1),
    theme: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
    colors: z.object({ bg: hex, primary: hex, secondary: hex, text: hex, link: hex, card: hex }).strict(),
    /** Portada prediseñada; se usa solo si la persona no subió una imagen de portada. */
    cover: z.enum(COVER_IDS).nullable().default(null),
    cardOpacity: z.number().int().min(20).max(100),
    border: z.object({ width: z.number().int().min(0).max(4), radius: z.number().int().min(0).max(28), color: hex }).strict(),
    background: z
      .object({
        kind: z.enum(["color", "gradient", "image"]),
        gradient: z.enum(GRADIENT_IDS),
        assetId: z.uuid().nullable(),
        position: z.enum(["center", "top", "bottom", "left", "right"]),
        size: z.enum(["cover", "contain", "auto"]),
        fixed: z.boolean(),
        /** Oscurece la imagen de fondo para que el texto se lea. */
        overlay: z.number().int().min(0).max(80),
      })
      .strict(),
    font: z.object({ heading: z.enum(FONT_IDS), body: z.enum(FONT_IDS), scale: z.number().int().min(90).max(115) }).strict(),
    blocks: z.array(blockSchema).length(BLOCK_IDS.length),
    player: z
      .object({
        showRadio: z.boolean(),
        song: z.object({ title: text(80), artist: text(80), url: musicUrl.nullable() }).strict().nullable(),
        links: z.array(musicUrl).max(3),
        /** Tu Spotify (perfil de artista o de usuario) y una playlist suya. */
        spotify: z.object({ profile: spotifyProfileUrl.nullable(), playlist: spotifyPlaylistUrl.nullable() }).strict().default({ profile: null, playlist: null }),
        /** Videos de YouTube (por enlace; no se sube ningún archivo). */
        videos: z.array(youtubeUrl).max(3).default([]),
      })
      .strict(),
    quote: text(200),
    musicinfo: z.object({ favoriteSong: text(80), favoriteArtist: text(80), since: text(30), scene: text(60) }).strict(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = new Set(d.blocks.map((b) => b.id));
    if (ids.size !== BLOCK_IDS.length) ctx.addIssue({ code: "custom", message: "Los bloques no pueden repetirse", path: ["blocks"] });
    if (d.background.kind === "image" && !d.background.assetId) ctx.addIssue({ code: "custom", message: "Elige una imagen de fondo", path: ["background", "assetId"] });
    // Legibilidad: el texto debe contrastar con el color real de las tarjetas.
    const card = mix(d.colors.card, d.colors.bg, d.cardOpacity / 100);
    if (contrast(d.colors.text, card) < 4.5) ctx.addIssue({ code: "custom", message: "El texto no se lee bien sobre las tarjetas: sube el contraste", path: ["colors", "text"] });
    if (contrast(d.colors.link, card) < 3) ctx.addIssue({ code: "custom", message: "El color de los enlaces no contrasta con las tarjetas", path: ["colors", "link"] });
  });

export type SpaceDesign = z.infer<typeof designSchema>;

/* ───────────── Color ───────────── */

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** `fg` sobre `bg` con opacidad `a` (0–1). */
export function mix(fg: string, bg: string, a: number): string {
  const f = rgb(fg);
  const b = rgb(bg);
  return toHex(f.map((v, i) => v * a + b[i] * (1 - a)));
}
function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ───────────── Render: diseño → variables CSS ───────────── */

/** Variables CSS del perfil. Todo valor sale de la validación (hex, enteros o listas cerradas): no hay texto libre. */
export function designVars(d: SpaceDesign, bgImageUrl: string | null): Record<string, string> {
  const font = (id: FontId) => FONTS.find((f) => f.id === id)!;
  const grad = GRADIENTS.find((g) => g.id === d.background.gradient)!;
  const bg =
    d.background.kind === "image" && bgImageUrl
      ? `linear-gradient(rgba(0,0,0,${d.background.overlay / 100}), rgba(0,0,0,${d.background.overlay / 100})), url("${bgImageUrl}")`
      : d.background.kind === "gradient"
        ? grad.css
        : d.colors.bg;
  const [cr, cg, cb] = rgb(d.colors.card);
  return {
    "--sp-bg": d.colors.bg,
    "--sp-bg-image": bg,
    "--sp-bg-size": d.background.kind === "image" ? d.background.size : "cover",
    "--sp-bg-pos": d.background.position,
    "--sp-bg-attach": d.background.fixed ? "fixed" : "scroll",
    "--sp-primary": d.colors.primary,
    "--sp-secondary": d.colors.secondary,
    "--sp-text": d.colors.text,
    "--sp-link": d.colors.link,
    "--sp-card": `rgba(${cr}, ${cg}, ${cb}, ${d.cardOpacity / 100})`,
    "--sp-border-w": `${d.border.width}px`,
    "--sp-radius": `${d.border.radius}px`,
    "--sp-border": d.border.color,
    "--sp-font-head": font(d.font.heading).stack,
    "--sp-font-body": font(d.font.body).stack,
    "--sp-head-stretch": font(d.font.heading).id === "archivo-wide" ? "125%" : "100%",
    "--sp-scale": String(d.font.scale / 100),
  };
}

/** Diseños guardados antes de existir Spotify/YouTube no traen esos campos: se completan al leerlos. */
export function normalizeDesign(d: SpaceDesign): SpaceDesign {
  const p = d.player as Partial<SpaceDesign["player"]>;
  return { ...d, cover: (d as Partial<SpaceDesign>).cover ?? null, player: { ...d.player, spotify: p.spotify ?? { profile: null, playlist: null }, videos: p.videos ?? [] } };
}

export function orderedBlocks(d: SpaceDesign, column: "main" | "side"): BlockId[] {
  return d.blocks.filter((b) => b.visible && BLOCK_COLUMN[b.id] === column).map((b) => b.id);
}
