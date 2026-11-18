import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DbHandle } from "@/lib/db";
import { resetRateLimits } from "@/lib/rate-limit";
import type { SessionUser } from "@/modules/users/auth";
import { users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { registerListener } from "@/modules/spaces/accounts";
import { DEFAULT_THEMES } from "@/modules/spaces/defaults";
import { meAssetDeleteHandler, meAssetUploadHandler, meDesignHandler, meGetHandler, meProfileHandler, mePublishHandler, meUnpublishHandler, meUsernameHandler, reportHandler, spaceImageHandler } from "@/modules/spaces/http";
import { setDisabled } from "@/modules/spaces/moderation";
import { getMySpace } from "@/modules/spaces/profile";
import { makeDb } from "./helpers";

let h: DbHandle;
let root: string;
let ana: SessionUser;
let beto: SessionUser;
let admin: { id: string; role: "admin" };
const ORIGIN = "http://localhost:3000";
const MAIL_OFF = { configured: false, send: async () => undefined };
const MAIL_ON = { configured: true, send: async () => undefined };

const json = (method: string, body: unknown, headers: Record<string, string> = {}) => {
  const raw = JSON.stringify(body);
  return new Request(`${ORIGIN}/x`, { method, headers: { origin: ORIGIN, "content-type": "application/json", "content-length": String(raw.length), ...headers }, body: raw });
};
const png = (extra = 100) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(extra).fill(7)])], "a.png", { type: "image/png" });
const upload = (file: File, kind: string, headers: Record<string, string> = {}) => {
  const form = new FormData();
  form.set("kind", kind);
  form.set("file", file);
  return new Request(`${ORIGIN}/u`, { method: "POST", headers: { origin: ORIGIN, "content-length": String(file.size + 200), ...headers }, body: form });
};

async function mk(username: string): Promise<SessionUser> {
  const r = await registerListener(h.db, { email: `${username}@example.com`, password: "una-clave-larga-123", username }, { mailer: MAIL_OFF, siteUrl: ORIGIN });
  return { id: r.userId, role: "oyente", email: `${username}@example.com`, name: username };
}

beforeAll(async () => {
  h = await makeDb();
  root = await mkdtemp(path.join(tmpdir(), "spaces-http-"));
  await seedBase(h.db);
  ana = await mk("ana_dj");
  beto = await mk("beto_dj");
  const [a] = await h.db.insert(users).values({ email: "adm@example.com", name: "adm", role: "admin" }).returning();
  admin = { id: a.id, role: "admin" };
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await h.close();
});
beforeEach(() => resetRateLimits());

describe("sesión y defensa CSRF", () => {
  it("sin sesión 401 en todo; con sesión pero origen ajeno o ausente, 403", async () => {
    expect((await meGetHandler(h.db, null)).status).toBe(401);
    expect((await meProfileHandler(h.db, null, json("PUT", { displayName: "x" }))).status).toBe(401);
    for (const bad of [{ origin: "https://evil.example" }, { origin: "" }]) {
      expect((await meProfileHandler(h.db, ana, json("PUT", { displayName: "x" }, bad))).status).toBe(403);
      expect((await meDesignHandler(h.db, ana, json("PUT", DEFAULT_THEMES[0].design, bad))).status).toBe(403);
      expect((await mePublishHandler(h.db, ana, json("POST", {}, bad), MAIL_OFF)).status).toBe(403);
      expect((await meAssetUploadHandler(h.db, ana, upload(png(), "avatar", bad), root)).status).toBe(403);
    }
    expect((await reportHandler(h.db, null, json("POST", { username: "ana_dj", reason: "spam" }, { origin: "https://evil.example" }), "1.1.1.1")).status).toBe(403);
  });
});

describe("cada persona solo edita lo suyo", () => {
  it("las rutas /me actúan siempre sobre la sesión: Ana no puede tocar a Beto aunque lo intente", async () => {
    await meProfileHandler(h.db, ana, json("PUT", { displayName: "Soy Ana" }));
    // Intentos de apuntar a otra persona: campos extra se ignoran o se rechazan, nunca cambian a Beto.
    expect((await meProfileHandler(h.db, ana, json("PUT", { displayName: "Hackeo", userId: beto.id }))).status).toBeLessThan(500);
    await meUsernameHandler(h.db, ana, json("PUT", { username: "ana_dj", userId: beto.id }));
    expect((await getMySpace(h.db, beto.id)).profile.displayName).toBe("beto_dj");
    expect((await getMySpace(h.db, beto.id)).profile.username).toBe("beto_dj");
  });
  it("no se puede tomar el nombre de usuario de otra persona", async () => {
    const res = await meUsernameHandler(h.db, ana, json("PUT", { username: "BETO_DJ" }));
    expect(res.status).toBe(409);
  });
  it("una imagen ajena no se borra", async () => {
    const up = await meAssetUploadHandler(h.db, beto, upload(png(), "gallery"), root);
    expect(up.status).toBe(201);
    const { id } = await up.json();
    const del = await meAssetDeleteHandler(h.db, ana, new Request(`${ORIGIN}/x?id=${id}`, { method: "DELETE", headers: { origin: ORIGIN } }), root);
    expect(del.status).toBe(404);
  });
});

describe("diseño y publicación", () => {
  it("un diseño con CSS inyectado o claves extra se rechaza con 400 y no se guarda", async () => {
    const evil = { ...DEFAULT_THEMES[0].design, colors: { ...DEFAULT_THEMES[0].design.colors, bg: "#000; background:url(//evil)" } };
    expect((await meDesignHandler(h.db, ana, json("PUT", evil))).status).toBe(400);
    expect((await meDesignHandler(h.db, ana, json("PUT", { ...DEFAULT_THEMES[0].design, css: "body{display:none}" }))).status).toBe(400);
    expect((await meDesignHandler(h.db, ana, json("PUT", DEFAULT_THEMES[2].design))).status).toBe(200);
    expect((await getMySpace(h.db, ana.id)).design.theme).toBe("indie-alternative");
  });
  it("con el correo activo y sin confirmar, publicar da 403; sin proveedor de correo, publica", async () => {
    expect((await mePublishHandler(h.db, ana, json("POST", {}), MAIL_ON)).status).toBe(403);
    expect((await mePublishHandler(h.db, ana, json("POST", {}), MAIL_OFF)).status).toBe(200);
    expect((await getMySpace(h.db, ana.id)).profile.status).toBe("published");
    expect((await meUnpublishHandler(h.db, ana, json("DELETE", {}))).status).toBe(200);
    expect((await getMySpace(h.db, ana.id)).profile.status).toBe("draft");
  });
});

describe("imágenes: subida y servicio", () => {
  it("rechaza lo que no es imagen (aunque declare serlo) y lo demasiado grande, antes de leer el cuerpo", async () => {
    expect((await meAssetUploadHandler(h.db, ana, upload(new File(["no soy una imagen"], "x.png", { type: "image/png" }), "avatar"), root)).status).toBe(400);
    expect((await meAssetUploadHandler(h.db, ana, new Request(`${ORIGIN}/u`, { method: "POST", headers: { origin: ORIGIN, "content-length": String(50 * 1024 * 1024) }, body: "x" }), root)).status).toBe(413);
    expect((await meAssetUploadHandler(h.db, ana, new Request(`${ORIGIN}/u`, { method: "POST", headers: { origin: ORIGIN }, body: "x" }), root)).status).toBe(411);
  });
  it("una imagen es privada mientras el Space es borrador, pública al publicar y deja de servirse si se desactiva", async () => {
    const up = await meAssetUploadHandler(h.db, ana, upload(png(), "avatar"), root);
    const key = (await up.json()).url.replace("/s/", "");
    expect((await spaceImageHandler(h.db, null, root, key)).status).toBe(404); // borrador: no es pública
    const own = await spaceImageHandler(h.db, ana, root, key);
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toContain("no-store");
    expect((await spaceImageHandler(h.db, beto, root, key)).status).toBe(404); // otra persona tampoco
    await mePublishHandler(h.db, ana, json("POST", {}), MAIL_OFF);
    const pub = await spaceImageHandler(h.db, null, root, key);
    expect(pub.status).toBe(200);
    expect(pub.headers.get("content-type")).toBe("image/png");
    expect(pub.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pub.headers.get("content-security-policy")).toContain("sandbox");
    await setDisabled(h.db, admin, ana.id, true);
    expect((await spaceImageHandler(h.db, null, root, key)).status).toBe(404);
    expect((await spaceImageHandler(h.db, null, root, "../../etc/passwd")).status).toBe(404);
  });
});

describe("reportes", () => {
  it("se pueden enviar sin sesión, con límite por conexión", async () => {
    await meProfileHandler(h.db, beto, json("PUT", { displayName: "Beto" }));
    await mePublishHandler(h.db, beto, json("POST", {}), MAIL_OFF);
    const send = () => reportHandler(h.db, null, json("POST", { username: "beto_dj", reason: "spam" }), "9.9.9.9");
    for (let i = 0; i < 5; i++) expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(429);
    expect((await reportHandler(h.db, null, json("POST", { username: "beto_dj", reason: "inventado" }), "8.8.8.8")).status).toBe(400);
  });
});
