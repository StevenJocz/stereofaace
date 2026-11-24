/** Solo imágenes de la biblioteca propia: nunca envía URLs externas al optimizador. */
export function localMediaImage(value: string, siteUrl: string): string | null {
  try {
    const site = new URL(siteUrl);
    const url = new URL(value, site);
    if (url.origin !== site.origin || url.search || url.hash) return null;
    return /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(url.pathname)
      ? url.pathname
      : null;
  } catch {
    return null;
  }
}
