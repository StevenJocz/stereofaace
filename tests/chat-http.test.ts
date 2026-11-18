import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import type { Actor } from "@/lib/rbac";
import { spaceProfiles, users } from "@/db/schema";
import type { SessionUser } from "@/modules/users/auth";
import { publicChatGet, publicChatPost, publicRequestPost, publicRequestsGet, studioChatAction, studioChatFeed } from "@/modules/chat/http";
import { saveChatConfig } from "@/modules/chat/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
let n = 0;
/** Persona con cuenta (oyente). Su apodo en el chat sale del servidor: su @usuario si tiene Space; si no, su nombre. */
async function person(name = "Ana"): Promise<SessionUser> {
  const email = `p${++n}@example.com`;
  const [u] = await h.db.insert(users).values({ email, name, role: "oyente" }).returning();
  return { id: u.id, role: u.role, email, name };
}
beforeAll(async () => {
  h = await makeDb();
  const mk = async (role: Actor["role"], nm: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${nm}@example.com`, name: nm, role }).returning();
    return { id: u.id, role: u.role };
  };
  editor = await mk("locutor", "edi");
  redactor = await mk("redactor", "red");
  await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
});
afterAll(() => h.close());
beforeEach(() => resetRateLimits());

describe("chat público", () => {
  it("publica, lista y devuelve la configuración y quién eres", async () => {
    const ana = await person("Ana");
    const post = await publicChatPost(h.db, { text: "hola" }, "1.1.1.1", ana);
    expect(post.status).toBe(201);
    const r = await publicChatGet(h.db, { after: null, user: ana });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.config).toEqual({ enabled: true, requestsEnabled: true });
    expect(j.viewer).toEqual({ signedIn: true, nickname: "Ana" });
    expect(j.messages[0]).toMatchObject({ nickname: "Ana", body: "hola", mine: true });
  });

  it("sin cuenta se puede leer, pero no escribir ni pedir: 401 auth_required", async () => {
    const lectura = await publicChatGet(h.db, { after: null, user: null });
    expect(lectura.status).toBe(200);
    expect((await lectura.json()).viewer).toEqual({ signedIn: false, nickname: null });
    const w = await publicChatPost(h.db, { text: "hola" }, "1.1.1.1", null);
    expect(w.status).toBe(401);
    expect((await w.json()).code).toBe("auth_required");
    const r = await publicRequestPost(h.db, { title: "Strobe" }, "1.1.1.1", null);
    expect(r.status).toBe(401);
    expect((await r.json()).code).toBe("auth_required");
  });

  it("el apodo no lo elige el navegador: un apodo o id falsos en el cuerpo se ignoran", async () => {
    const bea = await person("Bea");
    await publicChatPost(h.db, { text: "soy yo", nickname: "Administrador", clientId: "robado-0001" }, "1.1.1.1", bea);
    const j = await (await publicChatGet(h.db, { after: null, user: bea })).json();
    expect(j.messages.at(-1)).toMatchObject({ nickname: "Bea", body: "soy yo", mine: true });
  });

  it("con Space, el apodo es su @usuario", async () => {
    const c = await person("Carlos Pérez");
    await h.db.insert(spaceProfiles).values({ userId: c.id, username: "carlos_dj", displayName: "Carlos" });
    await publicChatPost(h.db, { text: "hey" }, "1.1.1.1", c);
    const j = await (await publicChatGet(h.db, { after: null, user: c })).json();
    expect(j.viewer.nickname).toBe("carlos_dj");
    expect(j.messages.at(-1)).toMatchObject({ nickname: "carlos_dj" });
  });

  it("una cuenta con el Space desactivado por moderación no puede escribir", async () => {
    const d = await person("Dani");
    await h.db.insert(spaceProfiles).values({ userId: d.id, username: "dani_off", displayName: "Dani", status: "disabled" });
    expect((await publicChatPost(h.db, { text: "hola" }, "1.1.1.1", d)).status).toBe(403);
    expect((await publicRequestPost(h.db, { title: "X" }, "1.1.1.1", d)).status).toBe(403);
  });

  it("un cuerpo roto o con enlaces se rechaza con 400", async () => {
    const e = await person("Eva");
    expect((await publicChatPost(h.db, null, "1.1.1.1", e)).status).toBe(400);
    const link = await publicChatPost(h.db, { text: "entra a https://spam.example" }, "1.1.1.1", e);
    expect(link.status).toBe(400);
    expect((await link.json()).error).toMatch(/enlaces/i);
  });

  it("anti-flood: una persona no puede enviar más de un mensaje cada 2 segundos y una IP no más de 15 en 30 s", async () => {
    const f = await person("Fer");
    expect((await publicChatPost(h.db, { text: "uno" }, "2.2.2.2", f)).status).toBe(201);
    const fast = await publicChatPost(h.db, { text: "dos" }, "2.2.2.2", f);
    expect(fast.status).toBe(429);
    expect(fast.headers.get("retry-after")).toBeTruthy();
    for (let i = 0; i < 15; i++) await publicChatPost(h.db, { text: `m${i}` }, "3.3.3.3", await person(`Otra${i}`));
    expect((await publicChatPost(h.db, { text: "x" }, "3.3.3.3", await person("Ultima"))).status).toBe(429);
  });

  it("apagado responde 403 con el motivo", async () => {
    await saveChatConfig(h.db, editor, { enabled: false, requestsEnabled: true });
    const off = await publicChatPost(h.db, { text: "hola" }, "4.4.4.4", await person("Gus"));
    expect(off.status).toBe(403);
    await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
  });

  it("silenciada por el equipo: la cuenta sigue silenciada aunque cambie de navegador", async () => {
    const hugo = await person("Hugo");
    await publicChatPost(h.db, { text: "hola" }, "9.9.9.9", hugo);
    const feed = await (await studioChatFeed(h.db, editor, { after: null })).json();
    const m = feed.messages.find((x: { nickname: string }) => x.nickname === "Hugo");
    expect((await studioChatAction(h.db, editor, { action: "mute", clientId: m.clientId, minutes: 30 })).status).toBe(200);
    resetRateLimits();
    expect((await publicChatPost(h.db, { text: "otra vez" }, "9.9.9.10", hugo)).status).toBe(403);
    await studioChatAction(h.db, editor, { action: "mute", clientId: m.clientId, minutes: 0 });
  });
});

describe("pedidos públicos", () => {
  it("se piden y se listan", async () => {
    const ines = await person("Ines");
    const r = await publicRequestPost(h.db, { title: "Strobe", artist: "deadmau5" }, "5.5.5.5", ines);
    expect(r.status).toBe(201);
    const list = await (await publicRequestsGet(h.db, { user: ines })).json();
    expect(list.requests[0]).toMatchObject({ title: "Strobe", mine: true });
    expect(list.config.requestsEnabled).toBe(true);
    expect(list.viewer).toEqual({ signedIn: true, nickname: "Ines" });
    const anon = await (await publicRequestsGet(h.db, { user: null })).json();
    expect(anon.requests[0]).toMatchObject({ title: "Strobe", mine: false });
  });
  it("el comentario corto llega al pedido y a la tarjeta del chat", async () => {
    const jo = await person("Jose");
    const r = await publicRequestPost(h.db, { title: "Innerbloom", artist: "RÜFÜS DU SOL", note: "para mi novia" }, "8.8.8.8", jo);
    expect(r.status).toBe(201);
    const j = await (await publicChatGet(h.db, { after: null, user: jo })).json();
    expect(j.messages.at(-1)).toMatchObject({ kind: "request", body: "Innerbloom", note: "para mi novia", mine: true });
    const bad = await publicRequestPost(h.db, { title: "Otra", note: "x".repeat(101) }, "8.8.8.8", await person("Kai"));
    expect(bad.status).toBe(400);
  });
  it("un pedido cada 20 segundos por persona", async () => {
    const lu = await person("Luz");
    await publicRequestPost(h.db, { title: "Uno" }, "6.6.6.6", lu);
    expect((await publicRequestPost(h.db, { title: "Dos" }, "6.6.6.6", lu)).status).toBe(429);
  });
  it("título vacío = 400", async () => {
    expect((await publicRequestPost(h.db, { title: "" }, "7.7.7.7", await person("Max"))).status).toBe(400);
  });
});

describe("estudio (equipo)", () => {
  it("sin sesión 401 y sin permiso 403", async () => {
    expect((await studioChatFeed(h.db, null, { after: null })).status).toBe(401);
    expect((await studioChatFeed(h.db, redactor, { after: null })).status).toBe(403);
    expect((await studioChatAction(h.db, redactor, { action: "config", enabled: true, requestsEnabled: true })).status).toBe(403);
  });

  it("el feed trae mensajes con identificador, pedidos pendientes y configuración", async () => {
    const j = await (await studioChatFeed(h.db, editor, { after: null })).json();
    expect(j.config).toBeTruthy();
    expect(j.messages.length).toBeGreaterThan(0);
    expect(j.messages[0].clientId).toBeTruthy();
    expect(Array.isArray(j.requests)).toBe(true);
  });

  it("acciones: borrar, silenciar, cambiar un pedido y los interruptores", async () => {
    const feed = await (await studioChatFeed(h.db, editor, { after: null })).json();
    const m = feed.messages[0];
    expect((await studioChatAction(h.db, editor, { action: "delete", id: m.id })).status).toBe(200);
    expect((await studioChatAction(h.db, editor, { action: "mute", clientId: m.clientId, minutes: 15 })).status).toBe(200);
    const after = await (await studioChatFeed(h.db, editor, { after: null })).json();
    expect(after.messages.map((x: { id: number }) => x.id)).not.toContain(m.id);
    const req = after.requests[0];
    expect((await studioChatAction(h.db, editor, { action: "request", id: req.id, status: "played" })).status).toBe(200);
    expect((await studioChatAction(h.db, editor, { action: "config", enabled: false, requestsEnabled: false })).status).toBe(200);
    expect((await studioChatAction(h.db, editor, { action: "nada" })).status).toBe(400);
  });
});
