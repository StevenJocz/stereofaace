import sanitizeHtml from "sanitize-html";
import { ARTICLE_EMBED_HOSTS } from "@/modules/content/embed";

/**
 * Sanitización del HTML del editor. Es lo ÚNICO que se renderiza en el sitio público: el JSON de Tiptap
 * solo se usa para volver a editar. Lista blanca estricta:
 *  - sin scripts, estilos en línea, manejadores de eventos, SVG ni formularios;
 *  - enlaces solo https/mailto, con rel de seguridad; imágenes solo https;
 *  - iframes solo de proveedores oficiales, forzados a `sandbox`.
 */
const CLASSES = {
  div: ["sf-gallery", "sf-embed"],
  blockquote: ["sf-pullquote"],
  figure: ["sf-figure"],
  table: ["sf-table"],
};

export function sanitizeArticleHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p",
      "h2",
      "h3",
      "h4",
      "strong",
      "em",
      "u",
      "s",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
      "a",
      "br",
      "hr",
      "img",
      "figure",
      "figcaption",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "div",
      "iframe",
      "colgroup",
      "col",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "width", "height", "loading", "title"],
      iframe: ["src", "title", "allow", "allowfullscreen", "loading", "sandbox", "referrerpolicy", "width", "height"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
      col: ["span"],
      div: ["class"],
      blockquote: ["class"],
      figure: ["class"],
      table: ["class"],
    },
    allowedClasses: CLASSES,
    allowedSchemes: ["https", "mailto"],
    allowedSchemesByTag: { img: ["https"], iframe: ["https"], a: ["https", "mailto"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    allowedIframeHostnames: [...ARTICLE_EMBED_HOSTS],
    allowIframeRelativeUrls: false,
    disallowedTagsMode: "discard",
    // Un iframe cuyo destino no pasó el filtro (host no permitido, esquema inválido) se elimina por completo.
    exclusiveFilter: (frame) => frame.tag === "iframe" && !frame.attribs.src,
    transformTags: {
      a: (tag, attribs) => {
        const href = attribs.href ?? "";
        const external = /^https:/i.test(href);
        return {
          tagName: tag,
          attribs: {
            ...attribs,
            ...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {}),
          },
        };
      },
      img: (tag, attribs) => ({ tagName: tag, attribs: { ...attribs, loading: "lazy", alt: attribs.alt ?? "" } }),
      iframe: (tag, attribs) => ({
        tagName: tag,
        attribs: {
          src: attribs.src ?? "",
          title: attribs.title ?? "Contenido incrustado",
          loading: "lazy",
          allowfullscreen: "",
          referrerpolicy: "strict-origin-when-cross-origin",
          sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
        },
      }),
    },
  });
}

/** Texto plano del HTML (para tiempo de lectura y extractos). */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Minutos de lectura a 200 palabras por minuto, mínimo 1. */
export function readingMinutes(html: string): number {
  const words = htmlToText(html).split(" ").filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
