import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { articles, socialPosts, users } from "@/db/schema";
import {
  buildFacebookPost,
  getArticleSocial,
  getFacebookConfig,
  publishArticleToFacebook,
  saveFacebookConfig,
  syncFacebook,
  verifyFacebookSyncToken,
} from "@/modules/social/facebook";
import { makeDb } from "./helpers";

const SITE = "https://stereoface.online";
let h: DbHandle;
let admin: Actor;
let redactor: Actor;
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
let seq = 0;
async function article(p: Partial<typeof articles.$inferInsert> = {}) {
  seq++;
  const [a] = await h.db
    .insert(articles)
    .values({ slug: `nota-${seq}`, title: `Nota ${seq}`, dek: `Bajada ${seq}`, status: "published", publishedAt: new Date(), ...p })
    .returning();
  return a;
}
type Call = { url: string; body: URLSearchParams };
function graph(result: { status?: number; body: unknown } = { body: { id: "123_456" } }) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: new URLSearchParams(String(init?.body ?? "")) });
    return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  redactor = await mk("redactor", "red");
});
afterAll(() => h.close());

describe("buildFacebookPost", () => {
  it("el mensaje es el titular y la bajada, y el enlace es la nota en el sitio", () => {
    expect(buildFacebookPost({ title: "Gorillaz en Bogotá", dek: "El 17 de noviembre.", slug: "gorillaz-bogota" }, SITE)).toEqual({
      message: "Gorillaz en Bogotá\n\nEl 17 de noviembre.",
      link: "https://stereoface.online/noticias/gorillaz-bogota",
    });
  });
  it("sin bajada solo va el titular; una bajada larguísima se recorta", () => {
    expect(buildFacebookPost({ title: "Solo titular", dek: null, slug: "s" }, SITE).message).toBe("Solo titular");
    expect(buildFacebookPost({ title: "T", dek: "x".repeat(900), slug: "s" }, SITE).message.length).toBeLessThanOrEqual(500);
  });
});

describe("ajustes de Facebook", () => {
  it("solo quien administra los ajustes los ve y guarda; el token nunca se devuelve", async () => {
    await expect(getFacebookConfig(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
    await saveFacebookConfig(h.db, admin, { enabled: true, token: "EAAB-secreto" });
    const c = await getFacebookConfig(h.db, admin);
    expect(c).toMatchObject({ enabled: true, hasToken: true });
    expect(JSON.stringify(c)).not.toContain("EAAB-secreto");
  });

  it("activarlo fija desde cuándo se publica: las notas anteriores no se suben", async () => {
    const c = await getFacebookConfig(h.db, admin);
    expect(c.since).toBeTruthy();
    expect(Math.abs(Date.now() - Date.parse(c.since!))).toBeLessThan(60_000);
  });

  it("un token vacío conserva el guardado", async () => {
    await saveFacebookConfig(h.db, admin, { enabled: true, token: "" });
    expect((await getFacebookConfig(h.db, admin)).hasToken).toBe(true);
  });
});

describe("publishArticleToFacebook", () => {
  it("publica en la página con el token y el enlace, y lo registra", async () => {
    const a = await article();
    const { f, calls } = graph();
    const r = await publishArticleToFacebook(h.db, a.id, { fetchImpl: f, siteUrl: SITE });
    expect(r.status).toBe("posted");
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/me/feed");
    expect(calls[0].body.get("access_token")).toBe("EAAB-secreto");
    expect(calls[0].body.get("link")).toBe(`${SITE}/noticias/${a.slug}`);
    expect(calls[0].body.get("message")).toContain(a.title);
    const [row] = await h.db.select().from(socialPosts).where(eq(socialPosts.articleId, a.id));
    expect(row).toMatchObject({ status: "posted", externalId: "123_456", network: "facebook" });
  });

  it("no publica dos veces la misma nota, salvo que se fuerce", async () => {
    const a = await article();
    const first = graph();
    await publishArticleToFacebook(h.db, a.id, { fetchImpl: first.f, siteUrl: SITE });
    const again = graph();
    expect((await publishArticleToFacebook(h.db, a.id, { fetchImpl: again.f, siteUrl: SITE })).status).toBe("skipped");
    expect(again.calls).toHaveLength(0);
    expect((await publishArticleToFacebook(h.db, a.id, { fetchImpl: again.f, siteUrl: SITE, force: true })).status).toBe("posted");
  });

  it("si Facebook rechaza, se guarda el motivo y se puede reintentar", async () => {
    const a = await article();
    const bad = graph({ status: 400, body: { error: { message: "Invalid OAuth access token." } } });
    const r = await publishArticleToFacebook(h.db, a.id, { fetchImpl: bad.f, siteUrl: SITE });
    expect(r).toMatchObject({ status: "failed" });
    const [row] = await h.db.select().from(socialPosts).where(eq(socialPosts.articleId, a.id));
    expect(row).toMatchObject({ status: "failed", attempts: 1 });
    expect(row.error).toContain("Invalid OAuth");
    const ok = graph();
    expect((await publishArticleToFacebook(h.db, a.id, { fetchImpl: ok.f, siteUrl: SITE })).status).toBe("posted"); // el fallo no bloquea el reintento
  });

  it("una nota que no es pública (borrador, borrada) no se publica", async () => {
    const draft = await article({ status: "draft", publishedAt: null });
    const { f, calls } = graph();
    expect((await publishArticleToFacebook(h.db, draft.id, { fetchImpl: f, siteUrl: SITE })).status).toBe("skipped");
    expect(calls).toHaveLength(0);
  });

  it("apagado, o sin token, no publica nada", async () => {
    await saveFacebookConfig(h.db, admin, { enabled: false });
    const a = await article();
    const { f, calls } = graph();
    expect((await publishArticleToFacebook(h.db, a.id, { fetchImpl: f, siteUrl: SITE })).status).toBe("skipped");
    expect(calls).toHaveLength(0);
    await saveFacebookConfig(h.db, admin, { enabled: true });
  });
});

describe("syncFacebook (notas públicas pendientes)", () => {
  it("publica las públicas desde la fecha de activación que aún no están; ignora las anteriores y las programadas futuras", async () => {
    const since = Date.parse((await getFacebookConfig(h.db, admin)).since!);
    await new Promise((r) => setTimeout(r, 30)); // las notas nuevas son posteriores a la activación
    const fresh = await article();
    const dueScheduled = await article({ status: "scheduled", scheduledFor: new Date(), publishedAt: null });
    const future = await article({ status: "scheduled", scheduledFor: new Date(Date.now() + 3_600_000), publishedAt: null });
    const old = await article({ publishedAt: new Date(since - 86_400_000) });
    const { f, calls } = graph();
    const res = await syncFacebook(h.db, { fetchImpl: f, siteUrl: SITE });
    const links = calls.map((c) => c.body.get("link"));
    expect(links).toContain(`${SITE}/noticias/${fresh.slug}`);
    expect(links).toContain(`${SITE}/noticias/${dueScheduled.slug}`);
    expect(links).not.toContain(`${SITE}/noticias/${future.slug}`);
    expect(links).not.toContain(`${SITE}/noticias/${old.slug}`);
    expect(res.posted).toBeGreaterThanOrEqual(2);
    // segunda pasada: ya no hay pendientes
    const second = graph();
    expect((await syncFacebook(h.db, { fetchImpl: second.f, siteUrl: SITE })).posted).toBe(0);
  });
});

describe("getArticleSocial", () => {
  it("devuelve el estado de la nota para el editor", async () => {
    const a = await article();
    await publishArticleToFacebook(h.db, a.id, { fetchImpl: graph().f, siteUrl: SITE });
    expect(await getArticleSocial(h.db, admin, a.id)).toMatchObject({ status: "posted" });
    const none = await article();
    expect(await getArticleSocial(h.db, admin, none.id)).toBeNull();
  });
});

describe("token del monitor externo", () => {
  it("se genera al guardar y solo ese valor abre la sincronización", async () => {
    const c = await getFacebookConfig(h.db, admin);
    expect(c.syncToken).toMatch(/^[a-f0-9]{32}$/);
    expect(await verifyFacebookSyncToken(h.db, c.syncToken)).toBe(true);
    expect(await verifyFacebookSyncToken(h.db, "otro")).toBe(false);
    expect(await verifyFacebookSyncToken(h.db, "")).toBe(false);
  });
  it("no cambia al volver a guardar", async () => {
    const before = (await getFacebookConfig(h.db, admin)).syncToken;
    await saveFacebookConfig(h.db, admin, { enabled: true });
    expect((await getFacebookConfig(h.db, admin)).syncToken).toBe(before);
  });
});
