import { describe, expect, it } from "vitest";
import { htmlToText, readingMinutes, sanitizeArticleHtml } from "@/lib/sanitize";
import { toEmbedUrl } from "@/modules/content/embed";

const s = sanitizeArticleHtml;

describe("sanitizeArticleHtml: vectores XSS", () => {
  it("elimina scripts, estilos en línea y manejadores de eventos", () => {
    const out = s(
      '<p onclick="x()" style="color:red">Hola<script>alert(1)</script></p><img src="https://a.example/i.png" onerror="alert(1)">',
    );
    expect(out).not.toMatch(/script|onclick|onerror|style=/i);
    expect(out).toContain("<p>Hola</p>");
  });
  it("bloquea javascript:, data: y vbscript: en enlaces e imágenes", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>1</script>",
      "vbscript:x",
    ]) {
      expect(s(`<a href="${bad}">x</a>`), bad).not.toMatch(/href=/);
      expect(s(`<img src="${bad}">`), bad).not.toMatch(/src=/);
    }
    expect(s('<img src="http://a.example/i.png">')).not.toMatch(/src=/);
  });
  it("elimina svg, math, object, embed, form y estilos", () => {
    const out = s(
      '<svg onload="x()"><circle/></svg><math><mi>x</mi></math><object data="x"></object><embed src="x"><form action="https://evil.example"><input></form><style>*{}</style>',
    );
    expect(out).not.toMatch(/<svg|<math|<object|<embed|<form|<input|<style/i);
  });
  it("los enlaces externos llevan rel de seguridad y target blank", () => {
    const out = s('<a href="https://example.com/x">ok</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(out).toContain('target="_blank"');
  });
  it("iframes: solo proveedores oficiales y siempre con sandbox", () => {
    const ok = s('<iframe src="https://www.youtube-nocookie.com/embed/abcdef123" onload="x()"></iframe>');
    expect(ok).toContain("youtube-nocookie.com/embed/abcdef123");
    expect(ok).toContain("sandbox=");
    expect(ok).not.toMatch(/onload/);
    expect(s('<iframe src="https://evil.example/x"></iframe>')).not.toMatch(/iframe/);
    expect(s('<iframe src="https://www.youtube-nocookie.com.evil.example/x"></iframe>')).not.toMatch(/iframe/);
    expect(s('<iframe src="javascript:alert(1)"></iframe>')).not.toMatch(/iframe/);
    expect(
      s('<iframe srcdoc="<script>1</script>" src="https://www.youtube-nocookie.com/embed/abcdef123"></iframe>'),
    ).not.toMatch(/srcdoc/);
  });
  it("solo conserva las clases permitidas", () => {
    const out = s(
      '<div class="sf-gallery evil-class" id="x"><img src="https://a.example/1.png" alt="a"></div><blockquote class="sf-pullquote">q</blockquote>',
    );
    expect(out).toContain('class="sf-gallery"');
    expect(out).not.toMatch(/evil-class|id="x"/);
    expect(out).toContain('class="sf-pullquote"');
  });
  it("conserva el contenido editorial legítimo", () => {
    const html =
      "<h2>Titular</h2><p>Texto con <strong>negrita</strong> y <em>cursiva</em>.</p><ul><li>uno</li></ul><table><tbody><tr><td>x</td></tr></tbody></table>";
    expect(s(html)).toBe(html);
  });
  it("las imágenes siempre llevan alt y carga diferida", () => {
    const out = s('<img src="https://a.example/i.png">');
    expect(out).toContain('alt=""');
    expect(out).toContain('loading="lazy"');
  });
});

describe("incrustaciones y lectura", () => {
  it("convierte enlaces de YouTube y Vimeo a su reproductor oficial", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(toEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(toEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(toEmbedUrl("https://open.spotify.com/embed/album/abc")).toBe("https://open.spotify.com/embed/album/abc");
  });
  it("rechaza proveedores no permitidos, http y credenciales", () => {
    expect(toEmbedUrl("https://evil.example/x")).toBeNull();
    expect(toEmbedUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(toEmbedUrl("https://user:pw@open.spotify.com/x")).toBeNull();
    expect(toEmbedUrl("no es url")).toBeNull();
  });
  it("tiempo de lectura y texto plano", () => {
    expect(readingMinutes("<p>corto</p>")).toBe(1);
    expect(readingMinutes(`<p>${"palabra ".repeat(1000)}</p>`)).toBe(5);
    expect(htmlToText("<p>Hola <strong>mundo</strong> &amp; más</p>")).toBe("Hola mundo & más");
  });
});
