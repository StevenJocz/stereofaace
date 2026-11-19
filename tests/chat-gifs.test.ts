import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import type { SessionUser } from "@/modules/users/auth";
import { spaceAssets, spaceProfiles, users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { registerListener } from "@/modules/spaces/accounts";
import { readSpaceAsset } from "@/modules/spaces/assets";
import { chatWindow, postMessage, listMessages, saveChatConfig, getChatConfig } from "@/modules/chat/service";
import { publicChatGet, publicChatPost, userGifsHandler } from "@/modules/chat/http";
import { MAX_GIF_BYTES, MAX_USER_GIFS, listUserGifs, ownsUserGif, uploadUserGif, validateGifBytes } from "@/modules/chat/user-gifs";
import { makeDb } from "./helpers";

// GIF89a de 1×1 px válido.
const TINY = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 255, 255, 255, 0x21, 0xf9, 4, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]);
const gifFile = (bytes: Uint8Array = TINY, name = "a.gif") => new File([bytes as BlobPart], name, { type: "image/gif" });
const ORIGIN = "http://localhost:3000";
const MAIL = { mailer: { configured: false, send: async () => undefined }, siteUrl: ORIGIN };

let h: DbHandle;
let root: string;
let n = 0;
async function person(display = "Persona") {
  const username = `gif${++n}`;
  const r = await registerListener(h.db, { email: `${username}@example.com`, password: "una-clave-larga-123", username }, MAIL);
  await h.db.update(spaceProfiles).set({ displayName: display }).where(eq(spaceProfiles.userId, r.userId));
  const session: SessionUser = { id: r.userId, role: "oyente", email: `${username}@example.com`, name: username };
  return { id: r.userId, username, session };
}

beforeAll(async () => {
  h = await makeDb();
  await seedBase(h.db);
  root = mkdtempSync(path.join(tmpdir(), "sf-gifs-"));
  const [u] = await h.db.insert(users).values({ email: "dj@example.com", name: "dj", role: "locutor" }).returning();
  await saveChatConfig(h.db, { id: u.id, role: "locutor" }, { enabled: true, requestsEnabled: true });
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  return h.close();
});

describe("validación de un GIF por su contenido", () => {
  it("acepta un GIF válido y rechaza lo demás", () => {
    expect(validateGifBytes(TINY)).toMatchObject({ ok: true, width: 1, height: 1 });
    expect(validateGifBytes(new TextEncoder().encode("<script>alert(1)</script> no soy un gif"))).toMatchObject({ ok: false });
    expect(validateGifBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(0)]))).toMatchObject({ ok: false }); // un JPG con otro nombre
    expect(validateGifBytes(TINY.slice(0, TINY.length - 1))).toMatchObject({ ok: false, message: expect.stringMatching(/incompleto/i) }); // sin terminador
    const huge = Uint8Array.from(TINY);
    huge[6] = 0x59; // 601 px de ancho
    huge[7] = 0x02;
    expect(validateGifBytes(huge)).toMatchObject({ ok: false, message: expect.stringMatching(/600/) });
    expect(validateGifBytes(new Uint8Array(MAX_GIF_BYTES + 1))).toMatchObject({ ok: false });
  });
});

describe("subir y usar un GIF propio", () => {
  it("lo sube, lo lista, lo sirve (aunque el Space sea borrador) y solo su dueña puede enviarlo", async () => {
    const ana = await person("Ana");
    const beto = await person("Beto");
    const g = await uploadUserGif(h.db, ana.id, root, gifFile());
    expect((await listUserGifs(h.db, ana.id)).map((x) => x.key)).toEqual([g.key]);
    expect(await ownsUserGif(h.db, ana.id, g.key)).toBe(true);
    expect(await ownsUserGif(h.db, beto.id, g.key)).toBe(false);
    const img = await readSpaceAsset(h.db, root, g.key.slice(2), null);
    expect(img?.mime).toBe("image/gif");
    resetRateLimits();
    const ok = await publicChatPost(h.db, { gif: g.key }, "1.1.1.1", ana.session);
    expect(ok.status).toBe(201);
    expect((await ok.json()).message).toMatchObject({ gif: g.key, nickname: "Ana" });
    const robado = await publicChatPost(h.db, { gif: g.key }, "1.1.1.2", beto.session);
    expect(robado.status).toBe(400);
    expect((await robado.json()).error).toMatch(/no es tuyo/i);
    resetRateLimits();
    expect((await publicChatPost(h.db, { gif: "u:no-es-un-uuid" }, "1.1.1.3", ana.session)).status).toBe(400);
  });

  it("no acepta archivos que no son GIF, ni los de más de 2 MB, ni sin Space; máximo 12", async () => {
    const c = await person();
    await expect(uploadUserGif(h.db, c.id, root, gifFile(new TextEncoder().encode("<svg onload=alert(1)>"), "x.gif"))).rejects.toMatchObject({ code: "bad_image" });
    await expect(uploadUserGif(h.db, c.id, root, gifFile(new Uint8Array(MAX_GIF_BYTES + 1)))).rejects.toMatchObject({ code: "image_too_big" });
    const [sinSpace] = await h.db.insert(users).values({ email: "sin@example.com", name: "Sin", role: "colaborador" }).returning();
    await expect(uploadUserGif(h.db, sinSpace.id, root, gifFile())).rejects.toMatchObject({ code: "no_profile" });
    for (let i = 0; i < MAX_USER_GIFS; i++) await uploadUserGif(h.db, c.id, root, gifFile());
    await expect(uploadUserGif(h.db, c.id, root, gifFile())).rejects.toMatchObject({ code: "gallery_full" });
  });

  it("si la administración marca el GIF, deja de servirse y de poder enviarse", async () => {
    const d = await person();
    const g = await uploadUserGif(h.db, d.id, root, gifFile());
    await h.db.update(spaceAssets).set({ status: "flagged" }).where(eq(spaceAssets.storageKey, g.key.slice(2)));
    expect(await readSpaceAsset(h.db, root, g.key.slice(2), null)).toBeNull();
    expect(await ownsUserGif(h.db, d.id, g.key)).toBe(false);
  });

  it("la ruta HTTP exige sesión y rechaza un cuerpo que no es multipart", async () => {
    const e = await person();
    const get = (user: SessionUser | null) => userGifsHandler(h.db, user, new Request(`${ORIGIN}/api/chat/gifs`), root);
    expect((await get(null)).status).toBe(401);
    expect((await get(e.session)).status).toBe(200);
    const bad = await userGifsHandler(h.db, e.session, new Request(`${ORIGIN}/api/chat/gifs`, { method: "POST", headers: { origin: ORIGIN, "content-length": "10", "content-type": "text/plain" }, body: "hola mundo" }), root);
    expect(bad.status).toBe(400);
    const otroOrigen = await userGifsHandler(h.db, e.session, new Request(`${ORIGIN}/api/chat/gifs`, { method: "POST", headers: { origin: "https://evil.example" } }), root);
    expect(otroOrigen.status).toBe(403);
  });
});

describe("nombre visible y chulo", () => {
  it("el chat muestra el nombre visible del Space, y el chulo si el equipo lo dio", async () => {
    const f = await person("Fernanda Ríos");
    resetRateLimits();
    expect((await (await publicChatPost(h.db, { text: "hola" }, "2.2.2.1", f.session)).json()).message).toMatchObject({ nickname: "Fernanda Ríos", verified: false });
    await h.db.update(spaceProfiles).set({ badgeVerifiedAt: new Date() }).where(eq(spaceProfiles.userId, f.id));
    resetRateLimits();
    const j = await (await publicChatPost(h.db, { text: "otra" }, "2.2.2.2", f.session)).json();
    expect(j.message).toMatchObject({ nickname: "Fernanda Ríos", verified: true });
  });
  it("caracteres raros del nombre se limpian; si no queda nada útil, usa el @usuario", async () => {
    const g = await person("😀😀");
    resetRateLimits();
    const j = await (await publicChatPost(h.db, { text: "hey" }, "2.2.2.3", g.session)).json();
    expect(j.message.nickname).toBe(g.username);
  });
});

describe("reinicio del chat cada 6 horas", () => {
  it("las ventanas son de 6 horas fijas en hora de Bogotá (00:00, 06:00, 12:00 y 18:00)", () => {
    // 2026-11-18 17:30 en Bogotá = 22:30 UTC → ventana 12:00–18:00 (17:00–23:00 UTC)
    const w = chatWindow(new Date("2026-11-18T22:30:00Z"));
    expect(w.startsAt.toISOString()).toBe("2026-11-18T17:00:00.000Z");
    expect(w.resetsAt.toISOString()).toBe("2026-11-18T23:00:00.000Z");
    // 00:00 de Bogotá (05:00 UTC) inicia ventana
    expect(chatWindow(new Date("2026-11-18T05:00:00Z")).startsAt.toISOString()).toBe("2026-11-18T05:00:00.000Z");
    expect(chatWindow(new Date("2026-11-18T04:59:59Z")).startsAt.toISOString()).toBe("2026-11-17T23:00:00.000Z");
  });
  it("al cambiar de ventana el chat arranca limpio, aunque los mensajes viejos sigan guardados", async () => {
    const dia = await person("Dia");
    const t1 = new Date("2026-01-10T10:00:00Z"); // 05:00 Bogotá
    const t2 = new Date("2026-01-10T18:00:00Z"); // 13:00 Bogotá: otra ventana
    await postMessage(h.db, { clientId: "u" + dia.id.replace(/-/g, ""), nickname: "Dia", text: "de la mañana" }, t1);
    expect((await listMessages(h.db, { now: t1 })).messages.map((m) => m.body)).toContain("de la mañana");
    expect((await listMessages(h.db, { now: t2 })).messages.map((m) => m.body)).not.toContain("de la mañana");
    await postMessage(h.db, { clientId: "u" + dia.id.replace(/-/g, ""), nickname: "Dia", text: "de la tarde" }, t2);
    expect((await listMessages(h.db, { now: t2 })).messages.map((m) => m.body)).toEqual(["de la tarde"]);
  });
  it("la respuesta pública informa cuándo es el próximo reinicio", async () => {
    const j = await (await publicChatGet(h.db, { after: null, user: null })).json();
    expect(Date.parse(j.reset.resetsAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(j.reset.resetsAt) - Date.parse(j.reset.startsAt)).toBe(6 * 3600_000);
  });
  void getChatConfig;
});
