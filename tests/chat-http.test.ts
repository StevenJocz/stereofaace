import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { publicChatGet, publicChatPost, publicRequestPost, publicRequestsGet, studioChatAction, studioChatFeed } from "@/modules/chat/http";
import { saveChatConfig } from "@/modules/chat/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
beforeAll(async () => {
  h = await makeDb();
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };
  editor = await mk("editor", "edi");
  redactor = await mk("redactor", "red");
  await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
});
afterAll(() => h.close());
beforeEach(() => resetRateLimits());

const CID = "cliente-0001";
const body = (o: object) => ({ clientId: CID, nickname: "Ana", ...o });

describe("chat público", () => {
  it("publica, lista y devuelve la configuración", async () => {
    const post = await publicChatPost(h.db, body({ text: "hola" }), "1.1.1.1");
    expect(post.status).toBe(201);
    const r = await publicChatGet(h.db, { after: null, clientId: CID });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.config).toEqual({ enabled: true, requestsEnabled: true });
    expect(j.messages[0]).toMatchObject({ nickname: "Ana", body: "hola", mine: true });
  });

  it("un cuerpo roto o un identificador raro se rechaza con 400", async () => {
    expect((await publicChatPost(h.db, null, "1.1.1.1")).status).toBe(400);
    expect((await publicChatPost(h.db, body({ clientId: "x", text: "hola" }), "1.1.1.1")).status).toBe(400);
    const link = await publicChatPost(h.db, body({ text: "entra a https://spam.example" }), "1.1.1.1");
    expect(link.status).toBe(400);
    expect((await link.json()).error).toMatch(/enlaces/i);
  });

  it("anti-flood: una persona no puede enviar más de un mensaje cada 2 segundos y una IP no más de 15 en 30 s", async () => {
    expect((await publicChatPost(h.db, body({ text: "uno" }), "2.2.2.2")).status).toBe(201);
    const fast = await publicChatPost(h.db, body({ text: "dos" }), "2.2.2.2");
    expect(fast.status).toBe(429);
    expect(fast.headers.get("retry-after")).toBeTruthy();
    for (let i = 0; i < 15; i++) await publicChatPost(h.db, body({ clientId: `otro-cliente-${i}`, text: `m${i}` }), "3.3.3.3");
    expect((await publicChatPost(h.db, body({ clientId: "otro-cliente-99", text: "x" }), "3.3.3.3")).status).toBe(429);
  });

  it("apagado responde 403 con el motivo; silenciado también", async () => {
    await saveChatConfig(h.db, editor, { enabled: false, requestsEnabled: true });
    const off = await publicChatPost(h.db, body({ text: "hola" }), "4.4.4.4");
    expect(off.status).toBe(403);
    await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
  });
});

describe("pedidos públicos", () => {
  it("se piden y se listan", async () => {
    const r = await publicRequestPost(h.db, body({ title: "Strobe", artist: "deadmau5" }), "5.5.5.5");
    expect(r.status).toBe(201);
    const list = await (await publicRequestsGet(h.db, { clientId: CID })).json();
    expect(list.requests[0]).toMatchObject({ title: "Strobe", mine: true });
    expect(list.config.requestsEnabled).toBe(true);
  });
  it("el comentario corto llega al pedido y a la tarjeta del chat", async () => {
    const r = await publicRequestPost(h.db, body({ clientId: "cliente-nota-1", title: "Innerbloom", artist: "RÜFÜS DU SOL", note: "para mi novia" }), "8.8.8.8");
    expect(r.status).toBe(201);
    const j = await (await publicChatGet(h.db, { after: null, clientId: "cliente-nota-1" })).json();
    expect(j.messages.at(-1)).toMatchObject({ kind: "request", body: "Innerbloom", note: "para mi novia", mine: true });
    const bad = await publicRequestPost(h.db, body({ clientId: "cliente-nota-2", title: "Otra", note: "x".repeat(101) }), "8.8.8.8");
    expect(bad.status).toBe(400);
  });
  it("un pedido cada 20 segundos por persona", async () => {
    await publicRequestPost(h.db, body({ title: "Uno" }), "6.6.6.6");
    expect((await publicRequestPost(h.db, body({ title: "Dos" }), "6.6.6.6")).status).toBe(429);
  });
  it("título vacío = 400", async () => {
    expect((await publicRequestPost(h.db, body({ title: "" }), "7.7.7.7")).status).toBe(400);
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
