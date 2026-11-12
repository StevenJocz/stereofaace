import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { users } from "@/db/schema";
import { getRecentTracks, getStationFeed, parseFeed, parseHistory } from "@/modules/radio/nowplaying";
import { saveStudioConfig } from "@/modules/studio/settings";
import { makeDb } from "./helpers";

const song = (title: string, artist = "Artista", art = "https://radio.stereoface.online/api/station/stereo_face/art/x.jpg") => ({ id: title, art, title, artist, text: `${artist} - ${title}` });
const raw = {
  live: { is_live: true, streamer_name: "DJ 1" },
  now_playing: { played_at: 1000, duration: 200, song: song("Ahora") },
  song_history: [
    { played_at: 900, song: song("Antes 1") },
    { played_at: 800, song: song("Antes 2") },
    { played_at: 700, song: song("Antes 3", "", "http://inseguro.example/a.jpg") },
  ],
};

describe("parseFeed", () => {
  it("separa lo que suena y el historial, con la fecha en ISO y el locutor en vivo", () => {
    const f = parseFeed(raw);
    expect(f.nowPlaying).toMatchObject({ title: "Ahora", artist: "Artista", durationSec: 200, playedAt: new Date(1000 * 1000).toISOString() });
    expect(f.history.map((t) => t.title)).toEqual(["Antes 1", "Antes 2", "Antes 3"]);
    expect(f.live).toEqual({ isLive: true, streamer: "DJ 1" });
  });

  it("solo acepta carátulas https y usa el texto cuando falta el título", () => {
    const f = parseFeed({ now_playing: { played_at: 1, song: { text: "Solo texto", art: "javascript:alert(1)" } }, song_history: raw.song_history });
    expect(f.nowPlaying?.title).toBe("Solo texto");
    expect(f.nowPlaying?.art).toBeNull();
    expect(f.history[2].art).toBeNull();
  });

  it("una respuesta rota no revienta: sin pista y sin historial", () => {
    expect(parseFeed(null)).toEqual({ nowPlaying: null, history: [], live: { isLive: false, streamer: null } });
    expect(parseFeed({ now_playing: { song: {} }, song_history: "x" }).nowPlaying).toBeNull();
  });
});

describe("parseHistory (API con clave)", () => {
  it("ordena de la más reciente a la más antigua y respeta el límite", () => {
    const rows = [
      { played_at: 10, song: song("a") },
      { played_at: 30, song: song("c") },
      { played_at: 20, song: song("b") },
    ];
    expect(parseHistory(rows, 2).map((t) => t.title)).toEqual(["c", "b"]);
    expect(parseHistory("nada", 5)).toEqual([]);
  });
});

let h: DbHandle;
let admin: Actor;
beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "np@example.com", name: "np", role: "admin" }).returning();
  admin = { id: u.id, role: u.role };
});
afterAll(() => h.close());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("getStationFeed", () => {
  it("consulta la API pública de la estación configurada, sin clave", async () => {
    const calls: { url: string; key: string | null }[] = [];
    const f = await getStationFeed(h.db, (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), key: new Headers(init?.headers).get("x-api-key") });
      return json(raw);
    }) as unknown as typeof fetch);
    expect(calls).toEqual([{ url: "https://radio.stereoface.online/api/nowplaying/stereo_face", key: null }]);
    expect(f?.nowPlaying?.title).toBe("Ahora");
  });

  it("si AzuraCast falla o no responde, devuelve null", async () => {
    expect(await getStationFeed(h.db, (async () => json({}, 500)) as unknown as typeof fetch)).toBeNull();
    expect(await getStationFeed(h.db, (async () => { throw new Error("caído"); }) as unknown as typeof fetch)).toBeNull();
  });
});

describe("getRecentTracks (últimas canciones del dashboard)", () => {
  it("sin clave usa el historial público (suena + anteriores)", async () => {
    const list = await getRecentTracks(h.db, admin, 10, (async () => json(raw)) as unknown as typeof fetch);
    expect(list.map((t) => t.title)).toEqual(["Ahora", "Antes 1", "Antes 2", "Antes 3"]);
    expect(list[0].onAir).toBe(true);
    expect(list.slice(1).every((t) => !t.onAir)).toBe(true);
  });

  it("con clave pide hasta 10 al historial autenticado y no repite la que suena", async () => {
    await saveStudioConfig(h.db, admin, { baseUrl: "https://radio.stereoface.online", stationId: "stereo_face", apiKey: "k-123" });
    const longHistory = Array.from({ length: 12 }, (_, i) => ({ played_at: 1000 - i * 10, song: song(i === 0 ? "Ahora" : `H${i}`) }));
    const seen: { url: string; key: string | null }[] = [];
    const list = await getRecentTracks(h.db, admin, 10, (async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), key: new Headers(init?.headers).get("x-api-key") });
      return String(url).includes("/history") ? json(longHistory) : json(raw);
    }) as unknown as typeof fetch);
    expect(list).toHaveLength(10);
    expect(list[0]).toMatchObject({ title: "Ahora", onAir: true });
    expect(list.filter((t) => t.title === "Ahora")).toHaveLength(1);
    expect(seen.find((s) => s.url.includes("/history"))?.key).toBe("k-123");
  });

  it("si el historial con clave falla, cae al público", async () => {
    const list = await getRecentTracks(h.db, admin, 10, (async (url: string) => (String(url).includes("/history") ? json({}, 403) : json(raw))) as unknown as typeof fetch);
    expect(list.map((t) => t.title)).toEqual(["Ahora", "Antes 1", "Antes 2", "Antes 3"]);
  });
});
