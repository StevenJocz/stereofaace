import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { CHAT_GIFS } from "@/modules/chat/gifs";
import {
  createRequest,
  deleteMessage,
  getChatConfig,
  listMessages,
  listMessagesAdmin,
  listRequestsAdmin,
  listRequestsPublic,
  muteClient,
  postMessage,
  saveChatConfig,
  setRequestStatus,
  validateMessage,
} from "@/modules/chat/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let redactor: Actor;
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
beforeAll(async () => {
  h = await makeDb();
  editor = await mk("locutor", "edi");
  redactor = await mk("redactor", "red");
});
afterAll(() => h.close());

describe("validateMessage", () => {
  it("limpia espacios y acepta emojis", () => {
    expect(validateMessage({ nickname: "  Ana  ", text: "  hola   🔥🔥  " })).toEqual({ nickname: "Ana", body: "hola 🔥🔥", gif: null });
  });
  it("el apodo tiene de 2 a 20 caracteres sin símbolos raros", () => {
    for (const nickname of ["A", "x".repeat(21), "<script>", "ana@mail.com"]) expect(() => validateMessage({ nickname, text: "hola" })).toThrow(ZodError);
  });
  it("el texto no puede estar vacío ni pasar de 280 caracteres", () => {
    expect(() => validateMessage({ nickname: "Ana", text: "   " })).toThrow(ZodError);
    expect(() => validateMessage({ nickname: "Ana", text: "a".repeat(281) })).toThrow(ZodError);
  });
  it("no se permiten enlaces (anti-spam)", () => {
    for (const text of ["mira https://malo.example/x", "entra a www.malo.com", "visita malo.com/promo", "wa.me/57300"]) {
      expect(() => validateMessage({ nickname: "Ana", text }), text).toThrow(ZodError);
    }
  });
  it("un GIF debe ser de la bandeja predefinida y va sin texto obligatorio", () => {
    const key = CHAT_GIFS[0].key;
    expect(validateMessage({ nickname: "Ana", gif: key })).toEqual({ nickname: "Ana", body: null, gif: key });
    expect(() => validateMessage({ nickname: "Ana", gif: "otro-gif" })).toThrow(ZodError);
  });
});

describe("configuración", () => {
  it("el chat y los pedidos arrancan apagados hasta que el equipo los activa", async () => {
    expect(await getChatConfig(h.db)).toEqual({ enabled: false, requestsEnabled: false });
  });
  it("solo quien usa el estudio puede cambiarla", async () => {
    await expect(saveChatConfig(h.db, redactor, { enabled: true, requestsEnabled: true })).rejects.toBeInstanceOf(ForbiddenError);
    await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
    expect(await getChatConfig(h.db)).toEqual({ enabled: true, requestsEnabled: true });
  });
});

describe("mensajes", () => {
  it("publica y lista en orden, marcando los propios sin revelar el identificador de nadie", async () => {
    await postMessage(h.db, { clientId: "c1", nickname: "Ana", text: "hola" });
    await postMessage(h.db, { clientId: "c2", nickname: "Beto", text: "buenas" });
    const r = await listMessages(h.db, { clientId: "c1" });
    expect(r.messages.map((m) => [m.nickname, m.body, m.mine])).toEqual([["Ana", "hola", true], ["Beto", "buenas", false]]);
    expect(JSON.stringify(r)).not.toContain("clientId");
    expect(JSON.stringify(r.messages)).not.toContain("c2");
  });

  it("con un cursor solo devuelve lo nuevo", async () => {
    const first = await listMessages(h.db, {});
    await postMessage(h.db, { clientId: "c3", nickname: "Caro", text: "nuevo" });
    const next = await listMessages(h.db, { after: first.last });
    expect(next.messages.map((m) => m.body)).toEqual(["nuevo"]);
    expect((await listMessages(h.db, { after: next.last })).messages).toEqual([]);
  });

  it("apagado, no se puede escribir", async () => {
    await saveChatConfig(h.db, editor, { enabled: false, requestsEnabled: true });
    await expect(postMessage(h.db, { clientId: "c1", nickname: "Ana", text: "hola" })).rejects.toMatchObject({ code: "chat_off" });
    await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
  });

  it("moderación: el equipo borra mensajes (desaparecen de la lista) y solo quien usa el estudio", async () => {
    await postMessage(h.db, { clientId: "c4", nickname: "Dani", text: "mensaje feo" });
    const admin = await listMessagesAdmin(h.db, editor, {});
    const bad = admin.messages.find((m) => m.body === "mensaje feo")!;
    expect(bad.clientId).toBe("c4"); // el equipo sí ve el identificador para poder silenciar
    await expect(deleteMessage(h.db, redactor, bad.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteMessage(h.db, editor, bad.id);
    expect((await listMessages(h.db, {})).messages.some((m) => m.body === "mensaje feo")).toBe(false);
  });

  it("silenciar a alguien le impide escribir y pedir canciones, y se puede levantar con 0 minutos", async () => {
    await muteClient(h.db, editor, "c5", 30);
    await expect(postMessage(h.db, { clientId: "c5", nickname: "Eli", text: "hola" })).rejects.toMatchObject({ code: "chat_muted" });
    await expect(createRequest(h.db, { clientId: "c5", nickname: "Eli", title: "Una canción" })).rejects.toMatchObject({ code: "chat_muted" });
    await muteClient(h.db, editor, "c5", 0);
    await postMessage(h.db, { clientId: "c5", nickname: "Eli", text: "ya puedo" });
  });

  it("un silencio vence solo con el tiempo", async () => {
    await muteClient(h.db, editor, "c6", 10, new Date("2026-01-01T00:00:00Z"));
    await expect(postMessage(h.db, { clientId: "c6", nickname: "Fer", text: "x1" }, new Date("2026-01-01T00:05:00Z"))).rejects.toMatchObject({ code: "chat_muted" });
    await postMessage(h.db, { clientId: "c6", nickname: "Fer", text: "x2" }, new Date("2026-01-01T00:11:00Z"));
  });
});

describe("los pedidos aparecen en el chat como tarjeta", () => {
  it("un pedido nuevo publica un mensaje de tipo pedido con título y artista", async () => {
    await createRequest(h.db, { clientId: "t1", nickname: "Steven", title: "Strobe", artist: "deadmau5" });
    const list = await listMessages(h.db, {});
    const card = list.messages.at(-1)!;
    expect(card).toMatchObject({ kind: "request", nickname: "Steven", body: "Strobe", artist: "deadmau5", gif: null });
  });

  it("sin artista la tarjeta lleva solo el título", async () => {
    await createRequest(h.db, { clientId: "t2", nickname: "Ana", title: "Opus" });
    expect((await listMessages(h.db, {})).messages.at(-1)).toMatchObject({ kind: "request", body: "Opus", artist: null });
  });

  it("un pedido repetido no vuelve a publicarse", async () => {
    const before = (await listMessages(h.db, {})).messages.length;
    await createRequest(h.db, { clientId: "t1", nickname: "Steven", title: " strobe ", artist: "DEADMAU5" });
    expect((await listMessages(h.db, {})).messages.length).toBe(before);
  });

  it("con el chat apagado el pedido se registra pero no se publica en el chat", async () => {
    await saveChatConfig(h.db, editor, { enabled: false, requestsEnabled: true });
    const before = (await listMessagesAdmin(h.db, editor, {})).messages.length;
    await createRequest(h.db, { clientId: "t3", nickname: "Eli", title: "Silencio" });
    expect((await listMessagesAdmin(h.db, editor, {})).messages.length).toBe(before);
    expect((await listRequestsPublic(h.db, {})).some((r) => r.title === "Silencio")).toBe(true);
    await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: true });
  });

  it("el pedido puede llevar un comentario corto que sale en la tarjeta, en la lista pública y en la del DJ", async () => {
    await createRequest(h.db, { clientId: "t5", nickname: "Gus", title: "Innerbloom", artist: "RÜFÜS DU SOL", note: "para mi novia, es nuestro aniversario" });
    const card = (await listMessages(h.db, {})).messages.at(-1)!;
    expect(card).toMatchObject({ kind: "request", body: "Innerbloom", artist: "RÜFÜS DU SOL", note: "para mi novia, es nuestro aniversario" });
    expect((await listRequestsPublic(h.db, {})).find((r) => r.title === "Innerbloom")?.note).toBe("para mi novia, es nuestro aniversario");
    expect((await listRequestsAdmin(h.db, editor, { status: "pending" })).find((r) => r.title === "Innerbloom")?.note).toBe("para mi novia, es nuestro aniversario");
  });

  it("el comentario es opcional, de hasta 100 caracteres y sin enlaces", async () => {
    await createRequest(h.db, { clientId: "t6", nickname: "Hana", title: "Sin nota" });
    expect((await listMessages(h.db, {})).messages.at(-1)).toMatchObject({ note: null });
    await expect(createRequest(h.db, { clientId: "t6", nickname: "Hana", title: "Otra", note: "x".repeat(101) })).rejects.toBeInstanceOf(ZodError);
    await expect(createRequest(h.db, { clientId: "t6", nickname: "Hana", title: "Otra", note: "escucha https://spam.example" })).rejects.toBeInstanceOf(ZodError);
  });

  it("los mensajes normales siguen siendo de tipo mensaje", async () => {
    await postMessage(h.db, { clientId: "t4", nickname: "Caro", text: "hola" });
    expect((await listMessages(h.db, {})).messages.at(-1)).toMatchObject({ kind: "message", artist: null });
  });
});

describe("pedidos de canciones", () => {
  it("se crean pendientes, el público ve los recientes y marca los propios", async () => {
    await createRequest(h.db, { clientId: "p1", nickname: "Gus", title: "Strobe", artist: "deadmau5" });
    const r = await listRequestsPublic(h.db, { clientId: "p1" });
    expect(r[0]).toMatchObject({ title: "Strobe", artist: "deadmau5", status: "pending", mine: true });
    expect(JSON.stringify(r)).not.toContain("p1");
  });

  it("no repite el mismo pedido pendiente y limita a 3 pendientes por persona", async () => {
    const again = await createRequest(h.db, { clientId: "p1", nickname: "Gus", title: "  strobe ", artist: "DEADMAU5" });
    expect(again.duplicate).toBe(true);
    await createRequest(h.db, { clientId: "p1", nickname: "Gus", title: "Tema 2" });
    await createRequest(h.db, { clientId: "p1", nickname: "Gus", title: "Tema 3" });
    await expect(createRequest(h.db, { clientId: "p1", nickname: "Gus", title: "Tema 4" })).rejects.toMatchObject({ code: "request_limit" });
  });

  it("valida título y artista; sin enlaces", async () => {
    await expect(createRequest(h.db, { clientId: "p2", nickname: "Hana", title: "" })).rejects.toBeInstanceOf(ZodError);
    await expect(createRequest(h.db, { clientId: "p2", nickname: "Hana", title: "https://spam.example" })).rejects.toBeInstanceOf(ZodError);
  });

  it("el DJ los ve con el pedido más viejo primero y los marca como sonado o rechazado", async () => {
    const pending = await listRequestsAdmin(h.db, editor, { status: "pending" });
    expect(pending.length).toBeGreaterThanOrEqual(3);
    expect(Date.parse(pending[0].createdAt)).toBeLessThanOrEqual(Date.parse(pending.at(-1)!.createdAt));
    await expect(setRequestStatus(h.db, redactor, pending[0].id, "played")).rejects.toBeInstanceOf(ForbiddenError);
    await setRequestStatus(h.db, editor, pending[0].id, "played");
    await setRequestStatus(h.db, editor, pending[1].id, "rejected");
    const after = await listRequestsAdmin(h.db, editor, { status: "pending" });
    expect(after.map((r) => r.id)).not.toContain(pending[0].id);
    const pub = await listRequestsPublic(h.db, {});
    expect(pub.map((r) => r.id)).not.toContain(pending[1].id); // los rechazados no se muestran al público
  });

  it("apagados, no se pueden pedir", async () => {
    await saveChatConfig(h.db, editor, { enabled: true, requestsEnabled: false });
    await expect(createRequest(h.db, { clientId: "p3", nickname: "Ivo", title: "Algo" })).rejects.toMatchObject({ code: "requests_off" });
  });
});
