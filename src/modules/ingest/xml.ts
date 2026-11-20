/**
 * Lector de XML mínimo para feeds RSS/Atom. No es un parser general: no expande entidades propias ni DTD (no hay XXE ni
 * «billion laughs»), ignora comentarios e instrucciones, entiende CDATA y tiene topes de profundidad y de nodos.
 */
export type XmlNode = {
  /** Nombre en minúsculas, con prefijo si lo tiene (`media:content`). */
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Texto propio del elemento (no el de sus hijos). */
  text: string;
};

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const NAME_END = /[\s/>]/;

export function parseXml(src: string, limits: { maxNodes?: number; maxDepth?: number } = {}): XmlNode {
  const maxNodes = limits.maxNodes ?? 20_000;
  const maxDepth = limits.maxDepth ?? 32;
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let nodes = 0;
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = src.length;

  while (i < n) {
    const cur = stack[stack.length - 1];
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      cur.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) cur.text += decodeEntities(src.slice(i, lt));
    i = lt;

    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
    } else if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      cur.text += src.slice(i + 9, end === -1 ? n : end);
      i = end === -1 ? n : end + 3;
    } else if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      i = end === -1 ? n : end + 2;
    } else if (src.startsWith("<!", i)) {
      // DOCTYPE (con o sin subconjunto interno): se salta entero, sin interpretar entidades.
      let depth = 0;
      let j = i + 2;
      for (; j < n; j++) {
        const c = src[j];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === ">" && depth <= 0) break;
      }
      i = j + 1;
    } else if (src[i + 1] === "/") {
      const end = src.indexOf(">", i + 2);
      if (end === -1) break;
      const name = src.slice(i + 2, end).trim().toLowerCase();
      // Tolerante: cierra hasta el elemento que coincide; un cierre sin apertura se ignora.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = end + 1;
    } else {
      let j = i + 1;
      while (j < n && !NAME_END.test(src[j])) j++;
      const name = src.slice(i + 1, j).toLowerCase();
      if (!name) {
        cur.text += "<";
        i += 1;
        continue;
      }
      const attrs: Record<string, string> = {};
      let selfClosing = false;
      while (j < n) {
        while (j < n && /\s/.test(src[j])) j++;
        if (src[j] === ">") {
          j++;
          break;
        }
        if (src[j] === "/") {
          selfClosing = true;
          j++;
          continue;
        }
        let k = j;
        while (k < n && !/[\s=/>]/.test(src[k])) k++;
        const attr = src.slice(j, k).toLowerCase();
        j = k;
        while (j < n && /\s/.test(src[j])) j++;
        let value = "";
        if (src[j] === "=") {
          j++;
          while (j < n && /\s/.test(src[j])) j++;
          const q = src[j];
          if (q === '"' || q === "'") {
            const end = src.indexOf(q, j + 1);
            value = src.slice(j + 1, end === -1 ? n : end);
            j = end === -1 ? n : end + 1;
          } else {
            let e = j;
            while (e < n && !/[\s>]/.test(src[e])) e++;
            value = src.slice(j, e);
            j = e;
          }
        }
        if (attr) attrs[attr] = decodeEntities(value);
      }
      if (++nodes > maxNodes) throw new XmlError("El feed tiene demasiados elementos.");
      const node: XmlNode = { name, attrs, children: [], text: "" };
      cur.children.push(node);
      if (!selfClosing) {
        if (stack.length > maxDepth) throw new XmlError("El feed está anidado demasiado profundo.");
        stack.push(node);
      }
      i = j;
    }
  }
  if (root.children.length === 0) throw new XmlError("No parece un feed XML.");
  return root;
}

export const child = (node: XmlNode, name: string): XmlNode | undefined => node.children.find((c) => c.name === name);
export const childrenNamed = (node: XmlNode, name: string): XmlNode[] => node.children.filter((c) => c.name === name);
