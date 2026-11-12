/**
 * Incrustaciones de video/audio dentro de artículos. Solo proveedores oficiales conocidos; el mismo
 * listado lo usan el editor (para ayudar) y el sanitizador del servidor (que es quien manda).
 */
export const ARTICLE_EMBED_HOSTS = [
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "open.spotify.com",
  "w.soundcloud.com",
  "www.mixcloud.com",
  "bandcamp.com",
] as const;

export function isAllowedArticleEmbedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return ARTICLE_EMBED_HOSTS.some((a) => h === a || h.endsWith(`.${a}`));
}

/**
 * Convierte enlaces habituales (YouTube, Vimeo) a su URL de reproductor oficial incrustable.
 * Devuelve null si el enlace no es https o su proveedor no está permitido.
 */
export function toEmbedUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "youtube.com" || host === "m.youtube.com") {
    const id =
      u.pathname === "/watch" ? u.searchParams.get("v") : u.pathname.match(/^\/(?:embed|shorts)\/([\w-]{6,})/)?.[1];
    if (id && /^[\w-]{6,}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    return null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.match(/^\/(\d{5,})/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return isAllowedArticleEmbedHost(u.hostname) ? u.toString() : null;
}
