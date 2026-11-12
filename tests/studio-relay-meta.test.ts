import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { saveRelayConfig } from "@/modules/studio/relay";
import { getRelayNowPlaying, parseRelayStatus, statusUrlFor } from "@/modules/studio/relay-meta";
import { makeDb } from "./helpers";

describe("statusUrlFor", () => {
  it("myradio24: saca el nombre de la emisora de la dirección, sea la página o la señal", () => {
    expect(statusUrlFor("https://myradio24.org/tisradio")).toBe("https://myradio24.com/users/tisradio/status.json");
    expect(statusUrlFor("https://listen2.myradio24.com/tisradio")).toBe("https://myradio24.com/users/tisradio/status.json");
  });
  it("otras señales o nombres raros no tienen JSON de estado conocido", () => {
    expect(statusUrlFor("https://stream.example.org/live.mp3")).toBeNull();
    expect(statusUrlFor("https://myradio24.org/")).toBeNull();
    expect(statusUrlFor("https://myradio24.org/a%2Fb")).toBeNull();
    expect(statusUrlFor("no es url")).toBeNull();
  });
});

describe("parseRelayStatus", () => {
  it("lee la canción, el artista, la carátula (https) y la siguiente", () => {
    const r = parseRelayStatus({ online: 1, song: "Artista X - Tema Y", artist: "Artista X", songtitle: "Tema Y", img: "users/tisradio/files/1.jpg", nextsongs: [{ song: "Lo que sigue" }] });
    expect(r).toEqual({ title: "Tema Y", artist: "Artista X", img: "https://myradio24.com/users/tisradio/files/1.jpg", next: "Lo que sigue" });
  });
  it("sin artista usa el texto completo de la canción", () => {
    expect(parseRelayStatus({ song: "Uplifting Life Trance Episode 245", artist: "", songtitle: "Uplifting Life Trance Episode 245" })).toMatchObject({ title: "Uplifting Life Trance Episode 245", artist: "" });
  });
  it("respuestas rotas o sin canción dan null; una carátula no https se descarta", () => {
    expect(parseRelayStatus(null)).toBeNull();
    expect(parseRelayStatus({ song: "" })).toBeNull();
    expect(parseRelayStatus({ song: "A", img: "javascript:alert(1)" })?.img).toBeNull();
  });
});

let h: DbHandle;
let editor: Actor;
let admin: Actor;
beforeAll(async () => {
  h = await makeDb();
  const mk = async (role: Actor["role"], n: string): Promise<Actor> => {
    const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
    return { id: u.id, role: u.role };
  };
  admin = await mk("admin", "adm");
  editor = await mk("editor", "edi");
});
afterAll(() => h.close());

describe("getRelayNowPlaying", () => {
  const json = (b: unknown) => (async () => new Response(JSON.stringify(b), { status: 200 })) as unknown as typeof fetch;

  it("sin señal configurada o sin JSON conocido devuelve null", async () => {
    expect(await getRelayNowPlaying(h.db, editor, json({}))).toBeNull();
    await saveRelayConfig(h.db, admin, { name: "X", url: "https://stream.example.org/live.mp3", autodj: false });
    expect(await getRelayNowPlaying(h.db, editor, json({ song: "A" }))).toBeNull();
  });

  it("con myradio24 consulta el JSON de estado y devuelve la canción", async () => {
    await saveRelayConfig(h.db, admin, { name: "Trance Is Star Radio", url: "https://myradio24.org/tisradio", autodj: false });
    const calls: string[] = [];
    const f = (async (u: string) => {
      calls.push(String(u));
      return new Response(JSON.stringify({ song: "Uplifting Life", artist: "", songtitle: "Uplifting Life" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await getRelayNowPlaying(h.db, editor, f))?.title).toBe("Uplifting Life");
    expect(calls).toEqual(["https://myradio24.com/users/tisradio/status.json"]);
  });

  it("si el servicio falla devuelve null sin romper", async () => {
    const bad = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    expect(await getRelayNowPlaying(h.db, editor, bad)).toBeNull();
    const boom = (async () => { throw new Error("red"); }) as unknown as typeof fetch;
    expect(await getRelayNowPlaying(h.db, editor, boom)).toBeNull();
  });
});
