import { htmlToText } from "@/lib/sanitize";
import { child, childrenNamed, decodeEntities, parseXml, XmlError, type XmlNode } from "./xml";

export type FeedItem = {
  /** Identificador estable en la fuente (guid / id; si falta, el enlace). */
  guid: string;
  url: string;
  title: string;
  /** SOLO el extracto que el feed publica en `description`/`summary` (nunca el texto completo de `content:encoded`). */
  summary: string | null;
  publishedAt: Date | null;
  /** Imagen https de la nota (si la hay); se usa o no según la política de derechos de la fuente. */
  imageUrl: string | null;
  author: string | null;
};

export const MAX_SUMMARY = 500;

export const clipText = (s: string, max: number) => {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
};

const text = (n: XmlNode | undefined) => (n ? htmlToText(n.text) : "");

/** Quita la coletilla que WordPress añade al extracto («The post … appeared first on …», «La entrada … se publicó primero en …») y el «[…]». */
function cleanSummary(raw: string): string {
  return raw
    .replace(/\s*(?:The post|The article|La entrada|El artículo|El post)\b.{0,400}?\b(?:appeared first on|se publicó primero en|apareció primero en)\b.*$/i, "")
    .replace(/\s*\[(?:…|\.{3}|&#8230;)\]\s*$/, "…")
    .trim();
}

/** Enlace http(s) absoluto (resuelve relativos contra el feed) o null. */
function absoluteUrl(raw: string | undefined, base: string, httpsOnly = false): string | null {
  const v = raw?.trim();
  if (!v || v.length > 2048 || /^(data|javascript|file):/i.test(v)) return null;
  try {
    const u = new URL(v, base);
    if (u.username || u.password) return null;
    if (httpsOnly ? u.protocol !== "https:" : u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;
const isImage = (n: XmlNode) => {
  const t = (n.attrs.type ?? "").toLowerCase();
  const m = (n.attrs.medium ?? "").toLowerCase();
  return t.startsWith("image/") || m === "image" || (!t && !m && IMG_EXT.test(n.attrs.url ?? ""));
};

function findImage(item: XmlNode, base: string): string | null {
  const candidates: (string | undefined)[] = [];
  for (const n of childrenNamed(item, "media:content")) if (isImage(n)) candidates.push(n.attrs.url);
  for (const n of childrenNamed(item, "media:group")) for (const c of childrenNamed(n, "media:content")) if (isImage(c)) candidates.push(c.attrs.url);
  for (const n of childrenNamed(item, "media:thumbnail")) candidates.push(n.attrs.url);
  for (const n of childrenNamed(item, "enclosure")) if (isImage(n)) candidates.push(n.attrs.url);
  for (const url of candidates) {
    const ok = absoluteUrl(url, base, true);
    if (ok) return ok;
  }
  // Último recurso: la primera <img> del HTML del propio feed (no se descarga ninguna página).
  for (const name of ["content:encoded", "description", "content", "summary"]) {
    const html = child(item, name)?.text ?? "";
    const m = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(html);
    const ok = absoluteUrl(m?.[1] ?? m?.[2], base, true);
    if (ok) return ok;
  }
  return null;
}

function itemLink(item: XmlNode, base: string): string | null {
  const links = childrenNamed(item, "link");
  // Atom: <link rel="alternate" href="…"/>. RSS: <link>texto</link>.
  const atom = links.find((l) => l.attrs.href && (!l.attrs.rel || l.attrs.rel === "alternate"));
  if (atom) return absoluteUrl(atom.attrs.href, base);
  const rss = links.map((l) => l.text.trim()).find(Boolean);
  return absoluteUrl(rss, base);
}

function itemDate(item: XmlNode): Date | null {
  for (const name of ["pubdate", "dc:date", "published", "updated"]) {
    const raw = child(item, name)?.text.trim();
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function itemAuthor(item: XmlNode): string | null {
  const direct = text(child(item, "dc:creator")) || text(child(item, "author"));
  const atom = child(child(item, "author") ?? { name: "", attrs: {}, children: [], text: "" }, "name");
  const v = text(atom) || direct;
  return v ? clipText(v, 120) : null;
}

/** Imagen de portada declarada en el <head> de una página (Open Graph / Twitter Card), solo https. Es lo que usan los «avances» de enlaces. */
export function extractPageImage(html: string, pageUrl: string): string | null {
  const head = html.slice(0, html.search(/<\/head>/i) === -1 ? undefined : html.search(/<\/head>/i));
  const found: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content?.[1] ?? content?.[2];
    if (key && value && !(key in found)) found[key] = decodeEntities(value);
  }
  for (const key of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const ok = absoluteUrl(found[key], pageUrl, true);
    if (ok) return ok;
  }
  return null;
}

/** Elementos `item` (RSS/RDF) o `entry` (Atom), sin entrar dentro de ellos. */
function collectItems(node: XmlNode, out: XmlNode[] = []): XmlNode[] {
  for (const c of node.children) {
    if (c.name === "item" || c.name === "entry") out.push(c);
    else collectItems(c, out);
  }
  return out;
}

/**
 * Convierte un feed RSS 2.0, RSS 1.0 (RDF) o Atom en elementos normalizados. Los elementos sin título o sin enlace válido
 * se descartan. Lanza `XmlError` si no es un feed.
 */
export function parseFeed(xml: string, feedUrl: string): FeedItem[] {
  const root = parseXml(xml);
  const items = collectItems(root);
  const top = root.children[0]?.name ?? "";
  if (items.length === 0 && !/^(rss|feed|rdf:rdf)$/.test(top)) throw new XmlError("El contenido no es un feed RSS ni Atom.");

  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const item of items) {
    const title = clipText(text(child(item, "title")), 300);
    const url = itemLink(item, feedUrl);
    if (!title || !url) continue;
    const guid = (child(item, "guid")?.text.trim() || child(item, "id")?.text.trim() || url).slice(0, 500);
    if (seen.has(guid)) continue;
    seen.add(guid);
    const summaryRaw = cleanSummary(text(child(item, "description")) || text(child(item, "summary")));
    out.push({
      guid,
      url,
      title,
      summary: summaryRaw ? clipText(summaryRaw, MAX_SUMMARY) : null,
      publishedAt: itemDate(item),
      imageUrl: findImage(item, feedUrl),
      author: itemAuthor(item),
    });
  }
  return out;
}
