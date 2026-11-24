/** Un sitemap solo debe sugerir URLs indexables y canónicas. */
export function includeInSitemap(seo: { noindex?: boolean; canonical?: string }, url: string): boolean {
  if (seo.noindex) return false;
  if (!seo.canonical) return true;
  try {
    return new URL(seo.canonical).href.replace(/\/$/, "") === new URL(url).href.replace(/\/$/, "");
  } catch {
    return false;
  }
}
