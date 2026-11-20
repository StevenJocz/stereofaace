import { describe, expect, it } from "vitest";
import { extractPageImage, MAX_SUMMARY, parseFeed } from "@/modules/ingest/feed";
import { parseXml, XmlError } from "@/modules/ingest/xml";

const FEED = "https://www.mondosonoro.com/feed/";

const rss = (items: string) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Mondo Sonoro</title><link>https://www.mondosonoro.com</link>${items}</channel></rss>`;

describe("parseXml", () => {
  it("entiende CDATA, entidades, atributos con ambas comillas, comentarios y elementos vacíos", () => {
    const root = parseXml(`<?xml version="1.0"?><!-- hola --><a x="1" y='dos &amp; tres'><b><![CDATA[<p>hola</p>]]></b><c/><d>1 &lt; 2 &#8230; &#x41;</d></a>`);
    const a = root.children[0];
    expect(a.attrs).toEqual({ x: "1", y: "dos & tres" });
    expect(a.children.map((c) => c.name)).toEqual(["b", "c", "d"]);
    expect(a.children[0].text).toBe("<p>hola</p>");
    expect(a.children[2].text).toBe("1 < 2 … A");
  });

  it("no expande entidades propias del DOCTYPE (sin «billion laughs» ni XXE)", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "AAAAAAAAAA"><!ENTITY b "&a;&a;&a;&a;"><!ENTITY x SYSTEM "file:///etc/passwd">]><x>&b; &x;</x>`;
    const x = parseXml(xml).children[0];
    expect(x.text).toBe("&b; &x;");
  });

  it("tolera cierres desordenados y rechaza lo que no es XML o excede los topes", () => {
    expect(parseXml("<a><b>x</a>").children[0].children[0].text).toBe("x");
    expect(() => parseXml("solo texto")).toThrow(XmlError);
    expect(() => parseXml("<a>" + "<b/>".repeat(30), { maxNodes: 10 })).toThrow(XmlError);
    expect(() => parseXml("<a>".repeat(50), { maxDepth: 10 })).toThrow(XmlError);
  });
});

describe("parseFeed (RSS)", () => {
  const wp = rss(`
    <item>
      <title>Primavera Sound &#8211; Cartel completo</title>
      <link>https://www.mondosonoro.com/noticias/primavera-sound-2027/</link>
      <dc:creator><![CDATA[Ana Pérez]]></dc:creator>
      <pubDate>Fri, 20 Nov 2026 08:30:00 +0000</pubDate>
      <guid isPermaLink="false">https://www.mondosonoro.com/?p=1001</guid>
      <description><![CDATA[<p>El festival anuncia su cartel con cabezas de cartel de primera línea […]</p><p>The post Primavera Sound appeared first on Mondo Sonoro.</p>]]></description>
      <content:encoded><![CDATA[<p><img src="https://cdn.mondosonoro.com/foto-1.jpg" alt=""></p><p>TEXTO COMPLETO DE LA NOTA QUE NO SE DEBE USAR COMO EXTRACTO.</p>]]></content:encoded>
    </item>
    <item>
      <title>Sin extracto</title>
      <link>https://www.mondosonoro.com/noticias/b/</link>
      <guid>b</guid>
      <content:encoded><![CDATA[<p>Texto completo que tampoco es extracto.</p>]]></content:encoded>
    </item>`);

  it("toma título, enlace, fecha, firma y extracto limpio (sin la coletilla de WordPress)", () => {
    const [a] = parseFeed(wp, FEED);
    expect(a.title).toBe("Primavera Sound – Cartel completo");
    expect(a.url).toBe("https://www.mondosonoro.com/noticias/primavera-sound-2027/");
    expect(a.guid).toBe("https://www.mondosonoro.com/?p=1001");
    expect(a.author).toBe("Ana Pérez");
    expect(a.publishedAt?.toISOString()).toBe("2026-11-20T08:30:00.000Z");
    expect(a.summary).toBe("El festival anuncia su cartel con cabezas de cartel de primera línea…");
  });

  it("nunca usa el texto completo (content:encoded) como extracto", () => {
    const items = parseFeed(wp, FEED);
    expect(items[0].summary).not.toContain("TEXTO COMPLETO");
    expect(items[1].summary).toBeNull();
  });

  it("la imagen sale de la primera <img> del contenido si no hay media:content", () => {
    expect(parseFeed(wp, FEED)[0].imageUrl).toBe("https://cdn.mondosonoro.com/foto-1.jpg");
    expect(parseFeed(wp, FEED)[1].imageUrl).toBeNull();
  });

  it("media:content y enclosure tienen prioridad y solo se aceptan imágenes https", () => {
    const xml = rss(`
      <item><title>A</title><link>https://x.test/a</link><media:content url="https://cdn.x.test/a.jpg" medium="image"/><description>d</description></item>
      <item><title>B</title><link>https://x.test/b</link><enclosure url="https://cdn.x.test/b.png" type="image/png" length="1"/></item>
      <item><title>C</title><link>https://x.test/c</link><media:content url="http://cdn.x.test/c.jpg" medium="image"/></item>
      <item><title>D</title><link>https://x.test/d</link><enclosure url="https://cdn.x.test/d.mp3" type="audio/mpeg" length="1"/></item>
      <item><title>E</title><link>https://x.test/e</link><description><![CDATA[<img src="/rel.jpg">]]></description></item>`);
    expect(parseFeed(xml, FEED).map((i) => i.imageUrl)).toEqual(["https://cdn.x.test/a.jpg", "https://cdn.x.test/b.png", null, null, "https://www.mondosonoro.com/rel.jpg"]);
  });

  it("recorta extractos largos y descarta duplicados, elementos sin título o con enlace no válido", () => {
    const long = "palabra ".repeat(200);
    const xml = rss(`
      <item><title>Largo</title><link>https://x.test/1</link><guid>g1</guid><description>${long}</description></item>
      <item><title>Repetido</title><link>https://x.test/2</link><guid>g1</guid></item>
      <item><title></title><link>https://x.test/3</link></item>
      <item><title>Sin enlace</title></item>
      <item><title>Peligroso</title><link>javascript:alert(1)</link></item>
      <item><title>Con credenciales</title><link>https://u:p@x.test/9</link></item>`);
    const items = parseFeed(xml, FEED);
    expect(items.map((i) => i.title)).toEqual(["Largo"]);
    expect(items[0].summary!.length).toBeLessThanOrEqual(MAX_SUMMARY + 1);
    expect(items[0].summary!.endsWith("…")).toBe(true);
  });

  it("el HTML del extracto se convierte en texto plano (nada de etiquetas ni scripts)", () => {
    const xml = rss(`<item><title>X</title><link>https://x.test/x</link><description><![CDATA[<p>Hola <b>mundo</b><script>alert(1)</script></p>]]></description></item>`);
    expect(parseFeed(xml, FEED)[0].summary).not.toMatch(/[<>]/);
    expect(parseFeed(xml, FEED)[0].summary).toContain("Hola mundo");
  });
});

describe("parseFeed (Atom y otros)", () => {
  it("lee entradas Atom con enlace alternate, resumen, fecha y autor", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Nota Atom</title><id>tag:x,2026:1</id>
      <link rel="self" href="https://x.test/self"/><link rel="alternate" href="/nota-atom"/>
      <updated>2026-11-19T10:00:00Z</updated><summary>Resumen corto</summary><author><name>Luis</name></author>
    </entry></feed>`;
    const [e] = parseFeed(xml, "https://x.test/feed");
    expect(e).toMatchObject({ title: "Nota Atom", guid: "tag:x,2026:1", url: "https://x.test/nota-atom", summary: "Resumen corto", author: "Luis" });
    expect(e.publishedAt?.toISOString()).toBe("2026-11-19T10:00:00.000Z");
  });

  it("un feed válido pero vacío da lista vacía; una página HTML cualquiera lanza error", () => {
    expect(parseFeed(rss(""), FEED)).toEqual([]);
    expect(() => parseFeed("<html><body><p>Hola</p></body></html>", FEED)).toThrow(XmlError);
    expect(() => parseFeed("no es xml", FEED)).toThrow(XmlError);
  });
});

describe("extractPageImage (og:image)", () => {
  const page = (head: string, body = "") => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

  it("prefiere og:image:secure_url / og:image y entiende cualquier orden de atributos", () => {
    expect(extractPageImage(page('<meta property="og:image" content="https://cdn.x.test/a.jpg">'), "https://x.test/n")).toBe("https://cdn.x.test/a.jpg");
    expect(extractPageImage(page('<meta content="https://cdn.x.test/b.jpg" property="og:image" />'), "https://x.test/n")).toBe("https://cdn.x.test/b.jpg");
    expect(extractPageImage(page("<meta property='og:image' content='https://cdn.x.test/c.jpg'><meta property=\"og:image:secure_url\" content=\"https://cdn.x.test/s.jpg\">"), "https://x.test/n")).toBe("https://cdn.x.test/s.jpg");
  });

  it("cae a twitter:image, resuelve rutas relativas y decodifica entidades", () => {
    expect(extractPageImage(page('<meta name="twitter:image" content="/img/t.jpg?a=1&amp;b=2">'), "https://x.test/n/1")).toBe("https://x.test/img/t.jpg?a=1&b=2");
  });

  it("solo https; ignora http, data: y lo que esté fuera del <head>", () => {
    expect(extractPageImage(page('<meta property="og:image" content="http://cdn.x.test/a.jpg">'), "https://x.test/n")).toBeNull();
    expect(extractPageImage(page('<meta property="og:image" content="data:image/png;base64,AAAA">'), "https://x.test/n")).toBeNull();
    expect(extractPageImage(page("", '<meta property="og:image" content="https://cdn.x.test/body.jpg">'), "https://x.test/n")).toBeNull();
    expect(extractPageImage("sin html", "https://x.test/n")).toBeNull();
  });
});
