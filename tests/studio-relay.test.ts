import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { ForbiddenError } from "@/lib/rbac";
import { users } from "@/db/schema";
import { getAutodjStatus, getRelayConfig, getRelayPublic, saveRelayConfig } from "@/modules/studio/relay";
import { relayStreamHandler } from "@/modules/studio/relay-http";
import { saveStudioConfig } from "@/modules/studio/settings";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;
let redactor: Actor;
const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
};
beforeAll(async () => {
  h = await makeDb();
  admin = await mk("admin", "adm");
  editor = await mk("editor", "edi");
  redactor = await mk("redactor", "red");
});
afterAll(() => h.close());

type Call = { method: string; url: string; body: unknown };
function azura(playlists: unknown[] = []) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === "GET") return new Response(JSON.stringify(playlists), { status: 200 });
    return new Response(JSON.stringify({ id: 7 }), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("configuración de la señal externa", () => {
  it("sin configurar no hay señal y el estudio solo ve nombre y si existe, nunca la dirección", async () => {
    expect(await getRelayPublic(h.db, editor)).toEqual({ configured: false, name: "Trance Is Star Radio" });
  });

  it("solo quien administra la emisora puede guardar; el editor la usa pero no la cambia", async () => {
    await expect(saveRelayConfig(h.db, editor, { name: "X", url: "https://a.example.org/s.mp3", autodj: false })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getRelayPublic(h.db, redactor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("valida la dirección: solo http(s) público", async () => {
    for (const url of ["ftp://a.example.org/s", "https://192.168.0.10/s", "http://localhost/s", "no es url"]) {
      await expect(saveRelayConfig(h.db, admin, { name: "X", url, autodj: false })).rejects.toBeInstanceOf(ZodError);
    }
  });

  it("guarda y luego el estudio ve que está configurada, sin la dirección", async () => {
    const r = await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://stream.example.org/live.mp3", autodj: false }, azura().f);
    expect(r.autodj).toBe("skipped");
    expect(await getRelayPublic(h.db, editor)).toEqual({ configured: true, name: "Trance Is Star Radio" });
    expect(JSON.stringify(await getRelayPublic(h.db, editor))).not.toContain("stream.example.org");
    expect((await getRelayConfig(h.db, admin)).url).toBe("https://stream.example.org/live.mp3");
  });
});

describe("AutoDJ: lista «URL remota» en AzuraCast", () => {
  it("sin clave de AzuraCast guarda la dirección y avisa que falta la clave", async () => {
    const r = await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://stream.example.org/live.mp3", autodj: true }, azura().f);
    expect(r.autodj).toBe("no_key");
  });

  it("con clave crea la lista remota si no existe", async () => {
    await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.stereoface.online", stationId: "stereo_face", apiKey: "K" });
    const { f, calls } = azura([]);
    const r = await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://stream.example.org/live.mp3", autodj: true }, f);
    expect(r.autodj).toBe("synced");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toBe("https://radio.stereoface.online/api/station/stereo_face/playlists");
    expect(post?.body).toMatchObject({ name: "Trance Is Star Radio", source: "remote_url", remote_type: "stream", remote_url: "https://stream.example.org/live.mp3", is_enabled: true, type: "default" });
  });

  it("si la lista ya existe la actualiza (y la apaga si se desactiva el AutoDJ)", async () => {
    const existing = [{ id: 9, name: "Trance Is Star Radio", source: "remote_url", remote_url: "https://old.example.org/x", is_enabled: true }];
    const on = azura(existing);
    await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://stream.example.org/live.mp3", autodj: true }, on.f);
    const put = on.calls.find((c) => c.method === "PUT");
    expect(put?.url).toBe("https://radio.stereoface.online/api/station/stereo_face/playlist/9");
    expect(put?.body).toMatchObject({ remote_url: "https://stream.example.org/live.mp3", is_enabled: true });
    const off = azura(existing);
    await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://stream.example.org/live.mp3", autodj: false }, off.f);
    expect(off.calls.find((c) => c.method === "PUT")?.body).toMatchObject({ is_enabled: false });
  });

  it("si AzuraCast falla, la configuración se guarda igual y se informa", async () => {
    const bad = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const r = await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://stream.example.org/otra.mp3", autodj: true }, bad);
    expect(r.autodj).toBe("failed");
    expect(r.detail).toContain("500"); // dice por qué falló, no solo que falló
    expect((await getRelayConfig(h.db, admin)).url).toBe("https://stream.example.org/otra.mp3");
  });
});

describe("proxy de la señal para el mezclador", () => {
  const upstream = (status = 200, type = "audio/mpeg") =>
    (async () => new Response("DATOS-DE-AUDIO", { status, headers: { "content-type": type, "icy-name": "x" } })) as unknown as typeof fetch;
  const req = () => new Request("http://x/api/studio/relay");

  it("sin sesión 401 y sin permiso 403", async () => {
    expect((await relayStreamHandler(h.db, null, req(), upstream())).status).toBe(401);
    expect((await relayStreamHandler(h.db, redactor, req(), upstream())).status).toBe(403);
  });

  it("entrega el audio con tipo, sin caché y con nosniff", async () => {
    const r = await relayStreamHandler(h.db, editor, req(), upstream());
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await r.text()).toBe("DATOS-DE-AUDIO");
  });

  it("rechaza con 502 si la señal no responde bien o no es audio", async () => {
    expect((await relayStreamHandler(h.db, editor, req(), upstream(503))).status).toBe(502);
    expect((await relayStreamHandler(h.db, editor, req(), upstream(200, "text/html"))).status).toBe(502);
  });

  it("si la conexión con la señal falla, 502", async () => {
    const f = (async () => { throw new Error("caída"); }) as unknown as typeof fetch;
    expect((await relayStreamHandler(h.db, editor, req(), f)).status).toBe(502);
  });
});

describe("AutoDJ exclusivo: la señal manda mientras esté activa", () => {
  const lists = () => [
    { id: 3, name: "Creative Commons", source: "songs", type: "default", is_enabled: true },
    { id: 4, name: "Jingles StereoFace", source: "songs", type: "once_per_x_songs", is_enabled: true },
    { id: 5, name: "Antigua", source: "songs", type: "default", is_enabled: false },
  ];
  const input = (autodj: boolean) => ({ name: "Trance Is Star Radio", url: "https://stream.example.org/live.mp3", autodj });

  it("al activarla pausa solo las listas de música normales que estaban encendidas y la señal pesa al máximo", async () => {
    const { f, calls } = azura(lists());
    await saveRelayConfig(h.db, admin, input(true), f);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts.map((c) => c.url.split("/").pop())).toEqual(["3"]); // ni los jingles ni la que ya estaba apagada
    expect(puts[0].body).toMatchObject({ is_enabled: false });
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ weight: 25 });
  });

  it("al desactivarla vuelve a encender exactamente las que ella pausó", async () => {
    const { f, calls } = azura([...lists().map((p) => (p.id === 3 ? { ...p, is_enabled: false } : p)), { id: 9, name: "Trance Is Star Radio", source: "remote_url", type: "default", is_enabled: true }]);
    await saveRelayConfig(h.db, admin, input(false), f);
    const on = calls.filter((c) => c.method === "PUT" && (c.body as { is_enabled?: boolean }).is_enabled === true);
    expect(on.map((c) => c.url.split("/").pop())).toEqual(["3"]);
    const again = azura(lists());
    await saveRelayConfig(h.db, admin, input(false), again.f);
    expect(again.calls.filter((c) => c.method === "PUT" && (c.body as { is_enabled?: boolean }).is_enabled === true)).toHaveLength(0); // ya no hay nada pausado por ella
  });
});

describe("estado del AutoDJ en AzuraCast (diagnóstico)", () => {
  const lists = [
    { id: 3, name: "Creative Commons", source: "songs", type: "default", is_enabled: true },
    { id: 9, name: "Trance Is Star Radio", source: "remote_url", type: "default", is_enabled: true, remote_url: "https://myradio24.org/tisradio" },
  ];
  it("solo la administración lo ve", async () => {
    await expect(getAutodjStatus(h.db, editor, azura(lists).f)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("lista las listas con su estado y marca cuál es la señal", async () => {
    const st = await getAutodjStatus(h.db, admin, azura(lists).f);
    expect(st).toMatchObject({ hasKey: true, error: null });
    expect(st.lists).toEqual([
      { name: "Creative Commons", kind: "música", enabled: true },
      { name: "Trance Is Star Radio", kind: "señal", enabled: true },
    ]);
  });
  it("si AzuraCast rechaza la clave, devuelve el motivo en vez de fallar", async () => {
    const denied = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    const st = await getAutodjStatus(h.db, admin, denied);
    expect(st.lists).toEqual([]);
    expect(st.error).toMatch(/clave/i);
  });
});
