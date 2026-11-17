import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { siteSettings, users, videoSessions, videoTickets } from "@/db/schema";
import { addSlot, saveProgram } from "@/modules/schedule/service";
import { assignPrograms } from "@/modules/users/admin";
import {
  beginYouTubeConnect,
  disconnectYouTube,
  finishYouTubeConnect,
  getPublicVideo,
  getVideoAdmin,
  pollVideo,
  prepareBroadcast,
  publishOffer,
  reconcile,
  setVideoPrivacy,
  stopBroadcast,
} from "@/modules/video/service";
import { makeDb } from "./helpers";
import { ANSWER, INGEST, OFFER, fakeDeps } from "./video-helpers";

let h: DbHandle;
let root: Actor;
let admin: Actor;
let locutor: Actor;
let locutor2: Actor;
let editor: Actor;
let redactor: Actor;
const REFRESH = "1//REFRESH-TOKEN-QUE-NO-DEBE-SALIR";
const WED_2030 = new Date("2026-03-04T20:30:00-05:00");
const WED_1500 = new Date("2026-03-04T15:00:00-05:00");

const mk = async (role: Actor["role"], n: string, extra: Partial<typeof users.$inferInsert> = {}): Promise<Actor> => {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role, ...extra }).returning();
  return { id: u.id, role: u.role };
};

/** Google simulado para el flujo OAuth. */
function google() {
  const calls: string[] = [];
  const f = (async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("oauth2.googleapis.com/token")) return Response.json({ refresh_token: REFRESH, access_token: "ACCESS" });
    if (u.includes("/channels")) return Response.json({ items: [{ id: "UC1", snippet: { title: "StereoFace Oficial" } }] });
    return new Response("{}");
  }) as unknown as typeof fetch;
  return { f, calls };
}

async function connect() {
  const g = google();
  const url = new URL(await beginYouTubeConnect(h.db, root));
  await finishYouTubeConnect(h.db, root, "code", url.searchParams.get("state")!, g.f);
}
const latest = async () => (await h.db.select().from(videoSessions).orderBy(desc(videoSessions.createdAt)))[0];
const endActive = async () => void (await h.db.update(videoSessions).set({ active: false, state: "ended" }).where(eq(videoSessions.active, true)));

beforeAll(async () => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "csecret");
  vi.stubEnv("VIDEO_SECRET_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("VIDEO_RELAY_TOKEN", "t".repeat(32));
  vi.stubEnv("VIDEO_RELAY_URL", "http://video-relay:8080");
  vi.stubEnv("VIDEO_WHIP_URL", "http://mediamtx:8889");
  h = await makeDb();
  root = await mk("superadmin", "root");
  admin = await mk("admin", "adm");
  editor = await mk("editor", "edi");
  redactor = await mk("redactor", "red");
  locutor = await mk("locutor", "loc", { djUsername: "loc-dj" });
  locutor2 = await mk("locutor", "loc2", { djUsername: "loc2-dj" });
  const prog = (await saveProgram(h.db, admin, { name: "Noche" })).id;
  await addSlot(h.db, admin, { programId: prog, kind: "weekly", weekday: 3, start: "20:00", end: "22:00" });
  await assignPrograms(h.db, admin, locutor.id, [prog]);
  await connect();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await h.close();
});
beforeEach(endActive);

describe("autorización", () => {
  it("editorial (editor, redactor) no usa la cámara en cabina", async () => {
    const { deps } = fakeDeps();
    for (const a of [editor, redactor]) {
      await expect(prepareBroadcast(h.db, a, deps)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(pollVideo(h.db, a, deps)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(stopBroadcast(h.db, a, deps)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(publishOffer(h.db, a, "x", OFFER, deps)).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(prepareBroadcast(h.db, null, deps)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un locutor solo transmite dentro de su horario; un administrador, siempre", async () => {
    await expect(prepareBroadcast(h.db, locutor, fakeDeps(() => WED_1500).deps)).rejects.toMatchObject({ code: "video_out_of_schedule" });
    await endActive();
    expect((await prepareBroadcast(h.db, locutor, fakeDeps(() => WED_2030).deps)).session.state).toBe("ready");
    await endActive();
    expect((await prepareBroadcast(h.db, admin, fakeDeps(() => WED_1500).deps)).session.state).toBe("ready");
  });

  it("un locutor sin programa asignado no transmite", async () => {
    await expect(prepareBroadcast(h.db, locutor2, fakeDeps(() => WED_2030).deps)).rejects.toMatchObject({ code: "video_out_of_schedule" });
  });
});

describe("preparar el directo", () => {
  it("crea la señal y el directo no listado, los enlaza y entrega una credencial de un solo uso", async () => {
    const { deps, log } = fakeDeps();
    const r = await prepareBroadcast(h.db, admin, deps);
    expect(log).toEqual(["create:unlisted", "bind:BROADCAST01:S1"]);
    expect(r.session).toMatchObject({ state: "ready", title: "StereoFace — En vivo desde cabina", privacy: "unlisted", mine: true });
    expect(r.ticket.length).toBeGreaterThan(30);
    const [t] = await h.db.select().from(videoTickets);
    expect(t.tokenHash).not.toBe(r.ticket); // solo se guarda el hash
    expect(JSON.stringify(r)).not.toContain("SECRET-STREAM-KEY");
  });

  it("solo hay una transmisión: otra persona recibe «ocupada»; quien aún no conectó puede pedir otra credencial", async () => {
    const { deps } = fakeDeps();
    const first = await prepareBroadcast(h.db, admin, deps);
    await expect(prepareBroadcast(h.db, root, deps)).rejects.toMatchObject({ code: "video_busy" });
    const again = await prepareBroadcast(h.db, admin, deps);
    expect(again.session.id).toBe(first.session.id);
    expect(again.ticket).not.toBe(first.ticket);
  });
});

describe("credencial WebRTC", () => {
  it("se canjea una sola vez, entrega la oferta a MediaMTX y arranca el relay con la dirección de YouTube", async () => {
    const { deps, log, st } = fakeDeps();
    const { ticket } = await prepareBroadcast(h.db, admin, deps);
    expect(await publishOffer(h.db, admin, ticket, OFFER, deps)).toBe(ANSWER);
    expect(log).toContain("relay:start");
    expect(st.relayUrl).toBe(INGEST); // la clave solo viaja servidor → relay
    await expect(publishOffer(h.db, admin, ticket, OFFER, deps)).rejects.toMatchObject({ code: "video_ticket" });
  });

  it("no sirve para otra persona, ni vencida, ni con una oferta que lleve audio (y esa no la consume)", async () => {
    let clock = new Date();
    const { deps } = fakeDeps(() => clock);
    const { ticket } = await prepareBroadcast(h.db, admin, deps);
    await expect(publishOffer(h.db, root, ticket, OFFER, deps)).rejects.toMatchObject({ code: "video_ticket" });
    await expect(publishOffer(h.db, admin, ticket, OFFER + "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n", deps)).rejects.toMatchObject({ code: "video_offer" });
    await expect(publishOffer(h.db, admin, "inventada", OFFER, deps)).rejects.toMatchObject({ code: "video_ticket" });
    clock = new Date(Date.now() + 3 * 60_000);
    await expect(publishOffer(h.db, admin, ticket, OFFER, deps)).rejects.toMatchObject({ code: "video_ticket" });
  });

  it("si el relay o MediaMTX fallan, la sesión pasa a error, se libera la cabina y no queda el relay encendido", async () => {
    const { deps, st, log } = fakeDeps();
    st.failWhip = true;
    const { ticket } = await prepareBroadcast(h.db, admin, deps);
    await expect(publishOffer(h.db, admin, ticket, OFFER, deps)).rejects.toThrow();
    const s = await latest();
    expect(s).toMatchObject({ state: "error", active: false });
    expect(log).toContain("relay:stop");
    expect((await prepareBroadcast(h.db, admin, fakeDeps().deps)).session.state).toBe("ready"); // la cabina quedó libre
  });
});

describe("estados del directo", () => {
  async function toLive(now: () => Date) {
    const f = fakeDeps(now);
    const { ticket } = await prepareBroadcast(h.db, admin, f.deps);
    await publishOffer(h.db, admin, ticket, OFFER, f.deps);
    return f;
  }

  it("preparada → previsualizando → iniciando → en vivo, un paso por comprobación", async () => {
    let clock = new Date();
    const f = await toLive(() => clock);
    const step = async () => {
      clock = new Date(clock.getTime() + 4000);
      return (await reconcile(h.db, f.deps))?.state;
    };
    expect(await step()).toBe("ready"); // YouTube aún no recibe señal
    f.st.health = "active";
    expect(await step()).toBe("previewing");
    expect(await step()).toBe("starting");
    expect(await step()).toBe("live");
    expect(f.log).toEqual(expect.arrayContaining(["transition:testing", "transition:live"]));
    expect(await getPublicVideo(h.db)).toEqual({ live: true, videoId: "BROADCAST01", title: "StereoFace — En vivo desde cabina" });
  });

  it("el público no ve nada hasta que está en vivo, y nunca claves", async () => {
    await toLive(() => new Date());
    expect(await getPublicVideo(h.db)).toEqual({ live: false });
  });

  it("dos comprobaciones seguidas no repiten las llamadas a YouTube", async () => {
    const f = await toLive(() => new Date());
    f.st.health = "active";
    await reconcile(h.db, f.deps);
    const before = f.log.length;
    await reconcile(h.db, f.deps); // dentro de los 3 s: se salta
    expect(f.log.length).toBe(before);
  });

  it("si YouTube no recibe señal a tiempo, termina en error con un motivo claro y libera la cabina", async () => {
    const f = await toLive(() => new Date(Date.now() + 5 * 60_000));
    const s = await reconcile(h.db, f.deps);
    expect(s).toBeNull();
    const row = await latest();
    expect(row).toMatchObject({ state: "error", active: false });
    expect(row.error).toMatch(/no recibió señal/);
    expect(f.log).toContain("relay:stop");
  });

  it("si el relay avisa de un error al leer la cámara, falla sin esperar", async () => {
    const f = await toLive(() => new Date());
    f.st.relayRunning = false;
    f.st.relayError = "No se pudo leer la cámara.";
    await reconcile(h.db, f.deps);
    expect((await latest()).state).toBe("error");
  });

  it("en vivo, si la señal se corta, el directo se cierra solo y se completa en YouTube", async () => {
    let clock = new Date();
    const f = await toLive(() => clock);
    f.st.health = "active";
    for (let i = 0; i < 4; i++) {
      clock = new Date(clock.getTime() + 4000);
      await reconcile(h.db, f.deps);
    }
    expect((await latest()).state).toBe("live");
    f.st.relayRunning = false;
    clock = new Date(clock.getTime() + 4000);
    await reconcile(h.db, f.deps);
    const row = await latest();
    expect(row).toMatchObject({ state: "ended", active: false });
    expect(row.error).toMatch(/se cortó/);
    expect(f.log).toContain("transition:complete");
  });

  it("si falla YouTube a mitad, termina en error sin filtrar detalles", async () => {
    const f = await toLive(() => new Date());
    f.st.health = "active";
    f.deps.youtube.transition = async () => {
      throw new Error("detalle interno: " + INGEST);
    };
    f.deps.youtube.broadcastLife = async () => "testing";
    await reconcile(h.db, f.deps); // → previewing (el intento de «testing» se tolera)
    await h.db.update(videoSessions).set({ checkedAt: null });
    await reconcile(h.db, f.deps);
    const row = await latest();
    expect(row.state).toBe("error");
    expect(row.error).not.toContain("SECRET-STREAM-KEY");
  });
});

describe("finalizar", () => {
  it("quien inició, o un administrador, finaliza: relay detenido y directo completado", async () => {
    const f = fakeDeps(() => WED_2030);
    await prepareBroadcast(h.db, locutor, f.deps);
    await stopBroadcast(h.db, locutor, f.deps);
    expect((await latest())).toMatchObject({ state: "ended", active: false });
    expect(f.log).toEqual(expect.arrayContaining(["relay:stop", "transition:complete"]));
    await endActive();
    const g = fakeDeps(() => WED_2030);
    await prepareBroadcast(h.db, locutor, g.deps);
    await stopBroadcast(h.db, admin, g.deps);
    expect((await h.db.select().from(videoSessions)).filter((s) => s.active)).toHaveLength(0);
  });

  it("otro locutor no puede finalizar la transmisión ajena", async () => {
    const f = fakeDeps(() => WED_2030);
    await prepareBroadcast(h.db, locutor, f.deps);
    await expect(stopBroadcast(h.db, locutor2, f.deps)).rejects.toMatchObject({ code: "video_not_yours" });
  });

  it("finalizar sin transmisión es inocuo", async () => {
    await expect(stopBroadcast(h.db, admin, fakeDeps().deps)).resolves.toBeUndefined();
  });
});

describe("conexión con YouTube (solo superadministrador)", () => {
  it("el refresh token se guarda cifrado y nunca aparece en la vista del administrador", async () => {
    const [row] = await h.db.select().from(siteSettings).where(eq(siteSettings.key, "video.youtube"));
    expect(JSON.stringify(row.value)).not.toContain("REFRESH-TOKEN");
    expect((row.value as { channelTitle: string }).channelTitle).toBe("StereoFace Oficial");
    const view = await getVideoAdmin(h.db, admin);
    expect(view).toMatchObject({ connected: true, channelTitle: "StereoFace Oficial", privacy: "unlisted" });
    expect(JSON.stringify(view)).not.toContain("REFRESH-TOKEN");
  });

  it("solo un superadministrador conecta, desconecta o cambia la privacidad", async () => {
    await expect(beginYouTubeConnect(h.db, admin)).rejects.toMatchObject({ code: "video_super_only" });
    await expect(setVideoPrivacy(h.db, admin, "public")).rejects.toMatchObject({ code: "video_super_only" });
    await expect(disconnectYouTube(h.db, admin)).rejects.toMatchObject({ code: "video_super_only" });
    await expect(setVideoPrivacy(h.db, locutor, "public")).rejects.toMatchObject({ code: "video_super_only" });
  });

  it("el estado de OAuth es de un solo intento y solo vale para quien lo pidió", async () => {
    const g = google();
    const state = new URL(await beginYouTubeConnect(h.db, root)).searchParams.get("state")!;
    await expect(finishYouTubeConnect(h.db, root, "c", "otro-estado", g.f)).rejects.toMatchObject({ code: "video_oauth_state" });
    await expect(finishYouTubeConnect(h.db, root, "c", state, g.f)).rejects.toMatchObject({ code: "video_oauth_state" }); // ya se consumió
    const state2 = new URL(await beginYouTubeConnect(h.db, root)).searchParams.get("state")!;
    const other = await mk("superadmin", "root2");
    await expect(finishYouTubeConnect(h.db, other, "c", state2, g.f)).rejects.toMatchObject({ code: "video_oauth_state" });
    expect(g.calls).toHaveLength(0); // sin estado válido no se llega a hablar con Google
  });

  it("los directos nuevos usan la privacidad elegida; público solo si el superadministrador lo decide", async () => {
    await setVideoPrivacy(h.db, root, "public");
    const f = fakeDeps();
    await prepareBroadcast(h.db, admin, f.deps);
    expect(f.log[0]).toBe("create:public");
    await endActive();
    await setVideoPrivacy(h.db, root, "unlisted");
    const g = fakeDeps();
    await prepareBroadcast(h.db, admin, g.deps);
    expect(g.log[0]).toBe("create:unlisted");
  });

  it("no se desconecta con un directo en curso; al desconectar se revoca en Google y se borra lo guardado", async () => {
    await prepareBroadcast(h.db, admin, fakeDeps().deps);
    await expect(disconnectYouTube(h.db, root)).rejects.toMatchObject({ code: "video_busy" });
    await endActive();
    const revoked: string[] = [];
    await disconnectYouTube(h.db, root, (async (u: string, init?: RequestInit) => {
      revoked.push(`${u}|${String((init?.body as URLSearchParams).get("token"))}`);
      return new Response("{}");
    }) as unknown as typeof fetch);
    expect(revoked[0]).toBe(`https://oauth2.googleapis.com/revoke|${REFRESH}`);
    expect(await h.db.select().from(siteSettings).where(eq(siteSettings.key, "video.youtube"))).toHaveLength(0);
    expect((await getVideoAdmin(h.db, root)).connected).toBe(false);
    await connect();
  });
});
