import http from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/rbac";
import { articleRevisions, articles, references, users } from "@/db/schema";
import { listRuns, MAX_FAILURES, pendingCount, probeSource, resumeSource, runDueSources, runSource, runSourceNow } from "@/modules/ingest/run";
import { sourceItems, sourceRuns, sources } from "@/modules/ingest/schema";
import { DomainError } from "@/lib/errors";
import { makeDb } from "./helpers";

const item = (n: number, extra = "") => `<item><title>Nota ${n}</title><link>https://www.mondosonoro.com/n/${n}/</link><guid isPermaLink="false">https://www.mondosonoro.com/?p=${n}</guid>
  <pubDate>Fri, 20 Nov 2026 0${n}:00:00 +0000</pubDate><dc:creator><![CDATA[Redacción]]></dc:creator>
  <description><![CDATA[<p>Extracto de la nota ${n}.</p><p>The post Nota ${n} appeared first on Mondo Sonoro.</p>]]></description>
  <content:encoded><![CDATA[<p><img src="https://cdn.mondosonoro.com/${n}.jpg"></p><p>CUERPO COMPLETO ${n}</p>]]></content:encoded>${extra}</item>`;
const feed = (n: number) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>MS</title>${Array.from({ length: n }, (_, i) => item(i + 1)).join("")}</channel></rss>`;

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let server: http.Server;
let base = "";
let reply: { status: number; body: string } = { status: 200, body: feed(3) };
const deps = { isPublic: () => true };

beforeAll(async () => {
  h = await makeDb();
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };
  admin = await mk("admin", "adm");
  editor = await mk("editor", "edi");
  server = http.createServer((_req, res) => res.writeHead(reply.status, { "content-type": "application/rss+xml" }).end(reply.body));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/feed/`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await h.close();
});
afterEach(() => {
  reply = { status: 200, body: feed(3) };
});

let seq = 0;
async function makeSource(over: Partial<typeof sources.$inferInsert> = {}) {
  const [s] = await h.db
    .insert(sources)
    .values({ name: "Mondo Sonoro", kind: "rss", url: `${base}?n=${++seq}`, active: true, termsVerifiedAt: new Date(), ...over })
    .returning();
  return s;
}
const run = (id: string, now?: Date) => runSource(h.db, id, { deps, now });

describe("condiciones para leer una fuente", () => {
  it("no lee fuentes desactivadas, sin términos verificados, pausadas o de otro tipo", async () => {
    await expect(run((await makeSource({ active: false })).id)).rejects.toThrow("desactivada");
    await expect(run((await makeSource({ termsVerifiedAt: null })).id)).rejects.toThrow("términos");
    await expect(run((await makeSource({ paused: true })).id)).rejects.toThrow("pausada");
    await expect(run((await makeSource({ kind: "api" })).id)).rejects.toThrow("RSS o Atom");
    await expect(run("00000000-0000-4000-8000-000000000000")).rejects.toThrow(DomainError);
  });
});

describe("ejecución", () => {
  it("crea un borrador por elemento nuevo con título, extracto, enlace y atribución (sin imagen con «solo metadatos»)", async () => {
    const s = await makeSource({ rightsPolicy: "metadata_only" });
    const r = await run(s.id);
    expect(r).toMatchObject({ status: "ok", newItems: 3, duplicates: 0, errors: 0 });

    const drafts = await h.db.select().from(articles).where(eq(articles.origin, "imported"));
    const mine = drafts.filter((a) => a.title.startsWith("Nota"));
    expect(mine.length).toBeGreaterThanOrEqual(3);
    const a = mine.find((x) => x.title === "Nota 1")!;
    expect(a).toMatchObject({ status: "draft", origin: "imported", authorId: null, authorName: "Redacción", coverUrl: null, publishedAt: null });
    expect(a.bodyHtml).toContain("Extracto de la nota 1.");
    expect(a.bodyHtml).toContain('<a href="https://www.mondosonoro.com/n/1/"');
    expect(a.bodyHtml).toContain("Mondo Sonoro</a>");
    expect(a.bodyHtml).not.toContain("CUERPO COMPLETO");
    expect(a.bodyHtml).not.toContain("appeared first on");
    const [ref] = await h.db.select().from(references).where(eq(references.articleId, a.id));
    expect(ref).toMatchObject({ url: "https://www.mondosonoro.com/n/1/", outlet: "Mondo Sonoro" });
    expect((await h.db.select().from(articleRevisions).where(eq(articleRevisions.articleId, a.id))).length).toBe(1);

    const items = await h.db.select().from(sourceItems).where(eq(sourceItems.sourceId, s.id));
    expect(items.map((i) => i.status)).toEqual(["pending_review", "pending_review", "pending_review"]);
    expect(items.every((i) => i.articleId)).toBe(true);
    expect(await pendingCount(h.db, admin, s.id)).toBe(3);

    const [src] = await h.db.select().from(sources).where(eq(sources.id, s.id));
    expect(src.lastRunAt).not.toBeNull();
    const [row] = await h.db.select().from(sourceRuns).where(eq(sourceRuns.sourceId, s.id));
    expect(row).toMatchObject({ status: "ok", newItems: 3, duplicates: 0, errors: 0 });
    expect(row.finishedAt).not.toBeNull();
  });

  it("con licencia o permiso expreso también trae la imagen, con su crédito", async () => {
    const s = await makeSource({ rightsPolicy: "express_permission" });
    await run(s.id);
    const [a] = await h.db.select().from(sourceItems).where(eq(sourceItems.sourceId, s.id)).limit(1);
    const art = (await h.db.select().from(articles).where(eq(articles.id, a.articleId!)))[0];
    expect(art.coverUrl).toMatch(/^https:\/\/cdn\.mondosonoro\.com\/\d\.jpg$/);
    expect(art.coverCredit).toBe("Foto: Mondo Sonoro (imagen de la nota original)");
    expect(art.coverAlt).toBe(art.title);
  });

  it("es idempotente: una segunda ejecución no duplica nada", async () => {
    const s = await makeSource();
    await run(s.id);
    const before = (await h.db.select().from(articles)).length;
    const r = await run(s.id, new Date(Date.now() + 1000));
    expect(r).toMatchObject({ status: "ok", newItems: 0, duplicates: 3 });
    expect((await h.db.select().from(articles)).length).toBe(before);
  });

  it("un elemento nuevo en el feed genera solo su borrador", async () => {
    const s = await makeSource();
    await run(s.id);
    reply = { status: 200, body: feed(4) };
    const r = await run(s.id, new Date(Date.now() + 1000));
    expect(r).toMatchObject({ newItems: 1, duplicates: 3 });
  });

  it("respeta el límite diario y retoma lo aplazado cuando hay margen", async () => {
    const s = await makeSource({ dailyLimit: 2 });
    const r1 = await run(s.id);
    expect(r1).toMatchObject({ newItems: 2, skippedByLimit: 1 });
    expect(r1.message).toContain("aplazados");
    const r2 = await run(s.id, new Date(Date.now() + 25 * 3_600_000));
    expect(r2).toMatchObject({ newItems: 1, duplicates: 2 });
  });

  it("nunca publica solo, aunque la política diga «publicar automáticamente»", async () => {
    const s = await makeSource({ publishPolicy: "autopublish" });
    await run(s.id);
    const [a] = await h.db.select().from(sourceItems).where(eq(sourceItems.sourceId, s.id)).limit(1);
    expect((await h.db.select().from(articles).where(eq(articles.id, a.articleId!)))[0].status).toBe("draft");
  });
});

describe("fallos", () => {
  it("un error del sitio queda registrado con un mensaje claro y suma un fallo", async () => {
    const s = await makeSource();
    reply = { status: 503, body: "caído" };
    const r = await run(s.id);
    expect(r).toMatchObject({ status: "error", newItems: 0 });
    expect(r.message).toContain("503");
    const [src] = await h.db.select().from(sources).where(eq(sources.id, s.id));
    expect(src.consecutiveFailures).toBe(1);
    const runs = await listRuns(h.db, editor, s.id);
    expect(runs[0]).toMatchObject({ status: "error", errors: 0 });
    expect(runs[0].log).toMatchObject({ message: expect.stringContaining("503") });
  });

  it("una URL que no es un feed (HTML) se reporta como error", async () => {
    const s = await makeSource();
    reply = { status: 200, body: "<html><body><p>Esto no es un feed</p></body></html>" };
    const r = await run(s.id);
    expect(r.status).toBe("error");
    expect(r.message).toContain("no es un feed");
  });

  it("tras 5 fallos seguidos se pausa sola; un éxito reinicia el contador; se reanuda desde el panel", async () => {
    const s = await makeSource();
    reply = { status: 500, body: "" };
    for (let i = 0; i < 2; i++) await run(s.id, new Date(Date.now() + i * 1000));
    reply = { status: 200, body: feed(1) };
    await run(s.id, new Date(Date.now() + 5000));
    expect((await h.db.select().from(sources).where(eq(sources.id, s.id)))[0].consecutiveFailures).toBe(0);

    reply = { status: 500, body: "" };
    let last;
    for (let i = 0; i < MAX_FAILURES; i++) last = await run(s.id, new Date(Date.now() + 10_000 + i * 1000)).catch((e: Error) => e);
    expect((last as { message: string }).message).toContain("se pausó");
    expect((await h.db.select().from(sources).where(eq(sources.id, s.id)))[0].paused).toBe(true);
    await expect(run(s.id)).rejects.toThrow("pausada");

    await resumeSource(h.db, admin, s.id);
    const [back] = await h.db.select().from(sources).where(eq(sources.id, s.id));
    expect(back).toMatchObject({ paused: false, consecutiveFailures: 0 });
  });
});

describe("planificación", () => {
  it("solo lee las fuentes a las que ya les toca y no las repite dentro del intervalo", async () => {
    const t0 = new Date("2030-01-01T10:00:00Z");
    const due = await makeSource({ intervalMinutes: 60, lastRunAt: new Date(t0.getTime() - 61 * 60_000) });
    const fresh = await makeSource({ intervalMinutes: 60, lastRunAt: new Date(t0.getTime() - 10 * 60_000) });
    const never = await makeSource({ intervalMinutes: 60, lastRunAt: null });
    const off = await makeSource({ active: false, lastRunAt: null });
    const unverified = await makeSource({ termsVerifiedAt: null, lastRunAt: null });

    const first = await runDueSources(h.db, { deps, now: t0 });
    const ids = first.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining([due.id, never.id]));
    expect(ids).not.toContain(fresh.id);
    expect(ids).not.toContain(off.id);
    expect(ids).not.toContain(unverified.id);

    const second = await runDueSources(h.db, { deps, now: new Date(t0.getTime() + 60_000) });
    expect(second.map((r) => r.id)).not.toContain(due.id);
    expect(second.map((r) => r.id)).not.toContain(never.id);
  });

  it("un error en una fuente no detiene a las demás", async () => {
    const t0 = new Date("2031-01-01T10:00:00Z");
    reply = { status: 500, body: "" };
    const a = await makeSource({ lastRunAt: null });
    const out = await runDueSources(h.db, { deps, now: t0 });
    expect(out.find((r) => r.id === a.id)?.result).toMatchObject({ status: "error" });
  });
});

describe("acciones del panel", () => {
  it("probar el feed no guarda nada y cuenta extractos e imágenes", async () => {
    const s = await makeSource({ active: false, termsVerifiedAt: null });
    const articlesBefore = (await h.db.select().from(articles)).length;
    const p = await probeSource(h.db, admin, s.id, deps);
    expect(p).toMatchObject({ ok: true, total: 3, withImage: 3, withSummary: 3 });
    expect(p.ok && p.sample.map((x) => x.title)).toEqual(["Nota 1", "Nota 2", "Nota 3"]);
    expect((await h.db.select().from(articles)).length).toBe(articlesBefore);
    expect(await h.db.select().from(sourceRuns).where(eq(sourceRuns.sourceId, s.id))).toHaveLength(0);

    reply = { status: 404, body: "" };
    expect(await probeSource(h.db, admin, s.id, deps)).toMatchObject({ ok: false, message: expect.stringContaining("404") });
  });

  it("ejecutar y reanudar exigen permiso de gestión; el editor solo puede ver", async () => {
    const s = await makeSource();
    await expect(runSourceNow(h.db, editor, s.id, deps)).rejects.toThrow(ForbiddenError);
    await expect(probeSource(h.db, editor, s.id, deps)).rejects.toThrow(ForbiddenError);
    await expect(resumeSource(h.db, editor, s.id)).rejects.toThrow(ForbiddenError);
    expect((await runSourceNow(h.db, admin, s.id, deps)).status).toBe("ok");
    expect(await listRuns(h.db, editor, s.id)).toHaveLength(1);
  });

  it("no permite dos ejecuciones a la vez de la misma fuente", async () => {
    const s = await makeSource();
    await h.db.insert(sourceRuns).values({ sourceId: s.id, status: "running" });
    await expect(run(s.id)).rejects.toThrow("en curso");
  });
});
