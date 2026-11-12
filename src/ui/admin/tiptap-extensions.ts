import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Nodos propios del editor. Todo lo que producen pasa después por el sanitizador del servidor
 * (lib/sanitize.ts), que solo admite estas clases y los proveedores de video/audio permitidos.
 */

/** Cita destacada de gran formato (distinta de la cita normal). */
export const Pullquote = Node.create({
  name: "pullquote",
  group: "block",
  content: "block+",
  defining: true,
  priority: 1000,
  parseHTML() {
    return [{ tag: "blockquote.sf-pullquote" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["blockquote", mergeAttributes(HTMLAttributes, { class: "sf-pullquote" }), 0];
  },
});

/** Reproductor de video/audio de un proveedor oficial (YouTube sin cookies, Vimeo, Spotify, SoundCloud…). */
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { src: { default: null }, title: { default: "Contenido incrustado" } };
  },
  parseHTML() {
    return [
      {
        tag: "div.sf-embed",
        getAttrs: (el) => {
          const f = (el as HTMLElement).querySelector("iframe");
          return f ? { src: f.getAttribute("src"), title: f.getAttribute("title") ?? "Contenido incrustado" } : false;
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "div",
      { class: "sf-embed" },
      ["iframe", { src: node.attrs.src, title: node.attrs.title, loading: "lazy", allowfullscreen: "true" }],
    ];
  },
});

/** Galería de 2 a 6 imágenes. */
export const Gallery = Node.create({
  name: "gallery",
  group: "block",
  content: "image{2,6}",
  isolating: true,
  parseHTML() {
    return [{ tag: "div.sf-gallery" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "sf-gallery" }), 0];
  },
});
