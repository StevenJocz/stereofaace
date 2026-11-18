import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { artists, authTokens, sessions, spaceAssets, spaceGenreOptions, spaceProfiles, spaceReports, spaceThemes, users } from "@/db/schema";
import { seedBase } from "@/db/seed-base";
import { DEFAULT_THEMES } from "@/modules/spaces/defaults";
import { registerListener, requestPasswordReset, resendVerification, resetPassword, verifyEmail, type AccountDeps } from "@/modules/spaces/accounts";
import { MAX_GALLERY, removeAsset, uploadAsset } from "@/modules/spaces/assets";
import { createMailer, type Mail } from "@/modules/spaces/mailer";
import { addGenreOption, closeReport, flagAsset, listReports, listSpacesAdmin, setDisabled, setFeatured, setGenreActive, setThemeActive } from "@/modules/spaces/moderation";
import { getMySpace, publishSpace, saveDraft, searchCatalogArtists, setFavoriteArtists, setGenres, unpublishSpace, updateProfile, updateUsername } from "@/modules/spaces/profile";
import { getPublicSpace, listSpaces, reportSpace } from "@/modules/spaces/public";
import { usernameSchema } from "@/modules/spaces/username";
import { makeDb } from "./helpers";

let h: DbHandle;
let root: string;
let admin: Actor;
const PW = "una-clave-larga-123";

/** Correo simulado: guarda lo «enviado» sin salir a la red. */
function mailbox(configured = true) {
  const sent: Mail[] = [];
  const deps: AccountDeps = { siteUrl: "https://stereoface.online", mailer: { configured, send: async (m) => void sent.push(m) } };
  const tokenOf = (i = sent.length - 1) => /token=([\w-]+)/.exec(sent[i].text)![1];
  return { sent, deps, tokenOf };
}
const png = (name = "a.png", extra = 100) => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(Math.floor(extra)).fill(7)])], name, { type: "image/png" });

let n = 0;
async function newUser(username = `user${++n}`, deps = mailbox(false).deps) {
  const r = await registerListener(h.db, { email: `${username}@example.com`, password: PW, username }, deps);
  return { id: r.userId, username };
}

beforeAll(async () => {
  h = await makeDb();
  root = await mkdtemp(path.join(tmpdir(), "spaces-"));
  const [a] = await h.db.insert(users).values({ email: "adm@example.com", name: "adm", role: "admin" }).returning();
  admin = { id: a.id, role: a.role };
  await seedBase(h.db);
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
  await h.close();
});

describe("datos base", () => {
  it("hay cinco plantillas y géneros elegibles tras el seed, y el seed es idempotente", async () => {
    await seedBase(h.db);
    expect(await h.db.select().from(spaceThemes)).toHaveLength(5);
    expect((await h.db.select().from(spaceGenreOptions)).length).toBeGreaterThanOrEqual(12);
  });
});

describe("nombre de usuario", () => {
  it("3–20 caracteres, minúsculas/números/guion bajo, sin reservados", () => {
    expect(usernameSchema.parse("  Neon_Raver ")).toBe("neon_raver");
    for (const bad of ["ab", "a".repeat(21), "con espacio", "ñandú", "a-b", "_inicio", "admin", "API", "stereoface", "spaces", "noticias"]) expect(usernameSchema.safeParse(bad).success, bad).toBe(false);
  });
});

describe("registro", () => {
  it("crea una cuenta de oyente (sin acceso al panel) con su perfil en borrador, y guarda la clave solo como hash", async () => {
    const { id } = await newUser("neonraver");
    const [u] = await h.db.select().from(users).where(eq(users.id, id));
    expect(u).toMatchObject({ role: "oyente", active: true });
    expect(u.passwordHash).toMatch(/^[\w$:./+=-]+$/);
    expect(u.passwordHash).not.toContain(PW);
    const [p] = await h.db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, id));
    expect(p).toMatchObject({ username: "neonraver", status: "draft", featured: false });
    expect(p.draftDesign?.theme).toBe(DEFAULT_THEMES[0].slug);
  });
  it("rechaza correo repetido, usuario repetido (sin importar mayúsculas), reservado y contraseña corta", async () => {
    const d = mailbox(false).deps;
    await expect(registerListener(h.db, { email: "neonraver@example.com", password: PW, username: "otro1" }, d)).rejects.toMatchObject({ code: "email_taken" });
    await expect(registerListener(h.db, { email: "nuevo@example.com", password: PW, username: "NEONRAVER" }, d)).rejects.toMatchObject({ code: "username_taken" });
    await expect(registerListener(h.db, { email: "nuevo@example.com", password: PW, username: "admin" }, d)).rejects.toThrow();
    await expect(registerListener(h.db, { email: "nuevo@example.com", password: "corta", username: "valido1" }, d)).rejects.toThrow();
    await expect(registerListener(h.db, { email: "no-es-correo", password: PW, username: "valido1" }, d)).rejects.toThrow();
  });
});

describe("verificación de correo y recuperación de contraseña", () => {
  it("con el correo activo se envía un enlace de un solo uso que verifica la cuenta", async () => {
    const mb = mailbox();
    const { id } = await newUser("verifica1", mb.deps);
    expect(mb.sent).toHaveLength(1);
    expect(mb.sent[0].to).toBe("verifica1@example.com");
    const token = mb.tokenOf();
    const [row] = await h.db.select().from(authTokens).where(eq(authTokens.userId, id));
    expect(row.tokenHash).not.toBe(token); // solo el hash
    await verifyEmail(h.db, token);
    expect((await h.db.select().from(users).where(eq(users.id, id)))[0].emailVerifiedAt).toBeInstanceOf(Date);
    await expect(verifyEmail(h.db, token)).rejects.toMatchObject({ code: "token_invalid" });
    await expect(verifyEmail(h.db, "inventado")).rejects.toMatchObject({ code: "token_invalid" });
  });
  it("un enlace vencido no sirve y reenviar invalida el anterior", async () => {
    const mb = mailbox();
    const { id } = await newUser("verifica2", mb.deps);
    const first = mb.tokenOf();
    await resendVerification(h.db, id, mb.deps);
    await expect(verifyEmail(h.db, first)).rejects.toMatchObject({ code: "token_invalid" });
    await h.db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.userId, id));
    await expect(verifyEmail(h.db, mb.tokenOf())).rejects.toMatchObject({ code: "token_invalid" });
  });
  it("recuperar contraseña responde igual exista o no el correo; el enlace cambia la clave una vez y cierra las sesiones", async () => {
    const mb = mailbox();
    const { id } = await newUser("recupera1", mb.deps);
    await h.db.insert(sessions).values({ userId: id, tokenHash: "h".repeat(64), expiresAt: new Date(Date.now() + 1e6) });
    const before = mb.sent.length;
    expect(await requestPasswordReset(h.db, "no-existe@example.com", mb.deps)).toEqual({ available: true });
    expect(mb.sent.length).toBe(before); // nada se envía a quien no tiene cuenta
    await requestPasswordReset(h.db, "RECUPERA1@example.com", mb.deps);
    const token = mb.tokenOf();
    await expect(resetPassword(h.db, token, "corta")).rejects.toThrow();
    await resetPassword(h.db, token, "otra-clave-larga-456");
    await expect(resetPassword(h.db, token, "otra-clave-larga-789")).rejects.toMatchObject({ code: "token_invalid" });
    expect(await h.db.select().from(sessions).where(eq(sessions.userId, id))).toHaveLength(0);
  });
  it("sin proveedor de correo no hay recuperación ni reenvío, pero tampoco se exige verificar", async () => {
    const off = mailbox(false);
    expect(await requestPasswordReset(h.db, "x@example.com", off.deps)).toEqual({ available: false });
    await expect(resendVerification(h.db, "00000000-0000-4000-8000-000000000000", off.deps)).rejects.toMatchObject({ code: "mail_off" });
    expect(createMailer({}).configured).toBe(false);
  });
  it("el proveedor de correo se llama con la clave por cabecera y sin registrar datos", async () => {
    const calls: { url: string; auth: string | null; body: string }[] = [];
    const m = createMailer({ RESEND_API_KEY: "re_x", EMAIL_FROM: "StereoFace <no-reply@stereoface.online>" }, (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), auth: (init?.headers as Record<string, string>).authorization, body: String(init?.body) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);
    await m.send({ to: "a@b.co", subject: "s", text: "t" });
    expect(calls[0]).toMatchObject({ url: "https://api.resend.com/emails", auth: "Bearer re_x" });
    const failing = createMailer({ RESEND_API_KEY: "k", EMAIL_FROM: "f" }, (async () => new Response("x", { status: 500 })) as unknown as typeof fetch);
    await expect(failing.send({ to: "a@b.co", subject: "s", text: "t" })).rejects.toThrow(/500/);
  });
});

describe("perfil: edición, privacidad y propiedad", () => {
  it("guarda campos con límites y descarta enlaces inseguros", async () => {
    const { id } = await newUser();
    await updateProfile(h.db, id, { displayName: "Valeria R.", bio: "Techno como terapia.", location: "Bogotá, Colombia", tagline: "Tu espacio.", links: { instagram: "https://instagram.com/neonraver", web: "https://mi-sitio.com" } });
    const s = await getMySpace(h.db, id);
    expect(s.profile).toMatchObject({ displayName: "Valeria R.", location: "Bogotá, Colombia", links: { instagram: "https://instagram.com/neonraver", web: "https://mi-sitio.com/" } });
    await expect(updateProfile(h.db, id, { displayName: "x", links: { instagram: "javascript:alert(1)" } })).rejects.toThrow();
    await expect(updateProfile(h.db, id, { displayName: "x", links: { instagram: "https://evil.example/x" } })).rejects.toThrow();
    await expect(updateProfile(h.db, id, { displayName: "" })).rejects.toThrow();
    await expect(updateProfile(h.db, id, { displayName: "x".repeat(41) })).rejects.toThrow();
    await expect(updateProfile(h.db, id, { displayName: "x", bio: "b".repeat(501) })).rejects.toThrow();
    await expect(updateProfile(h.db, id, { displayName: "x", links: { otra: "https://a.com" } })).rejects.toThrow(); // clave desconocida
    await updateProfile(h.db, id, { displayName: "x", bio: "Primera línea.\r\nSegunda línea.\n\nTercera." }); // la biografía admite saltos de línea
    expect((await getMySpace(h.db, id)).profile.bio).toBe("Primera línea.\nSegunda línea.\n\nTercera.");
    await expect(updateProfile(h.db, id, { displayName: "x", bio: "con\u0000nulo" })).rejects.toThrow();
    await expect(updateProfile(h.db, id, { displayName: "con\nsalto" })).rejects.toThrow(); // el nombre es de una sola línea
  });
  it("cada persona solo toca lo suyo: las funciones no aceptan el identificador de otra persona", async () => {
    const a = await newUser();
    const b = await newUser();
    await updateProfile(h.db, a.id, { displayName: "Persona A" });
    await updateProfile(h.db, b.id, { displayName: "Persona B" });
    expect((await getMySpace(h.db, a.id)).profile.displayName).toBe("Persona A");
    expect((await getMySpace(h.db, b.id)).profile.displayName).toBe("Persona B");
    await expect(updateProfile(h.db, "00000000-0000-4000-8000-000000000000", { displayName: "x" })).rejects.toMatchObject({ code: "no_profile" });
  });
  it("cambiar el usuario respeta unicidad y reservados", async () => {
    const a = await newUser("cambio_a");
    await newUser("cambio_b");
    await expect(updateUsername(h.db, a.id, "cambio_b")).rejects.toMatchObject({ code: "username_taken" });
    await expect(updateUsername(h.db, a.id, "root")).rejects.toThrow();
    expect(await updateUsername(h.db, a.id, "Cambio_C")).toEqual({ username: "cambio_c" });
  });
});

describe("géneros y artistas favoritos", () => {
  it("ordena géneros por preferencia, limita a 8 y rechaza géneros que no existen o están apagados", async () => {
    const { id } = await newUser();
    expect(await setGenres(h.db, id, ["techno", "house", "ambient"])).toEqual(["techno", "house", "ambient"]);
    expect((await getMySpace(h.db, id)).genres).toEqual(["techno", "house", "ambient"]);
    await setGenres(h.db, id, ["ambient", "techno"]);
    expect((await getMySpace(h.db, id)).genres).toEqual(["ambient", "techno"]);
    await expect(setGenres(h.db, id, ["no-existe"])).rejects.toMatchObject({ code: "bad_genre" });
    await expect(setGenres(h.db, id, Array.from({ length: 9 }, (_, i) => `g${i}`))).rejects.toThrow();
    await setGenreActive(h.db, admin, (await h.db.select().from(spaceGenreOptions).where(eq(spaceGenreOptions.slug, "trance")))[0].id, false);
    await expect(setGenres(h.db, id, ["trance"])).rejects.toMatchObject({ code: "bad_genre" });
  });
  it("artistas del catálogo o escritos a mano, con el nombre oficial del catálogo", async () => {
    const { id } = await newUser();
    const [a] = await h.db.insert(artists).values({ slug: "rufus-du-sol", name: "RÜFÜS DU SOL" }).returning();
    await setFavoriteArtists(h.db, id, [{ artistId: a.id, name: "otro nombre" }, { name: "Banda local" }, { name: "  " }]);
    expect((await getMySpace(h.db, id)).artists).toEqual([{ artistId: a.id, name: "RÜFÜS DU SOL" }, { artistId: null, name: "Banda local" }]);
    await expect(setFavoriteArtists(h.db, id, [{ artistId: "6b1a4e0e-3f0a-4a3b-8f6e-0c9d2b7a1e55" }])).rejects.toMatchObject({ code: "bad_artist" });
    await expect(setFavoriteArtists(h.db, id, Array.from({ length: 13 }, (_, i) => ({ name: `a${i}` })))).rejects.toThrow();
    expect((await searchCatalogArtists(h.db, "rüf")).map((x) => x.name)).toContain("RÜFÜS DU SOL");
    expect(await searchCatalogArtists(h.db, "r")).toEqual([]);
  });
});

describe("imágenes", () => {
  it("valida tipo por contenido, tamaño y cuotas; avatar y fondo se reemplazan; la galería tiene tope", async () => {
    const { id } = await newUser();
    await expect(uploadAsset(h.db, id, root, "avatar", new File(["no soy imagen"], "x.png", { type: "image/png" }))).rejects.toMatchObject({ code: "bad_image" });
    await expect(uploadAsset(h.db, id, root, "avatar", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.jpg", { type: "image/jpeg" }))).rejects.toMatchObject({ code: "bad_image" }); // MIME ≠ contenido
    await expect(uploadAsset(h.db, id, root, "avatar", png("big.png", 5 * 1024 * 1024))).rejects.toMatchObject({ code: "image_too_big" });
    await expect(uploadAsset(h.db, id, root, "script", png())).rejects.toMatchObject({ code: "bad_kind" });
    const first = await uploadAsset(h.db, id, root, "avatar", png());
    const second = await uploadAsset(h.db, id, root, "avatar", png("b.png"));
    expect((await getMySpace(h.db, id)).avatarUrl).toBe(`/s/${second.storageKey}`);
    expect(await h.db.select().from(spaceAssets).where(eq(spaceAssets.id, first.id))).toHaveLength(0);
    for (let i = 0; i < MAX_GALLERY; i++) await uploadAsset(h.db, id, root, "gallery", png(`g${i}.png`));
    await expect(uploadAsset(h.db, id, root, "gallery", png("extra.png"))).rejects.toMatchObject({ code: "gallery_full" });
  });
  it("la cuota total por persona impide abusar del almacenamiento", async () => {
    const { id } = await newUser();
    for (let i = 0; i < 5; i++) await uploadAsset(h.db, id, root, "gallery", png(`q${i}.png`, 4.9 * 1024 * 1024));
    await uploadAsset(h.db, id, root, "cover", png("cover.png", 4.9 * 1024 * 1024));
    await expect(uploadAsset(h.db, id, root, "background", png("fondo.png", 4.9 * 1024 * 1024))).rejects.toMatchObject({ code: "quota" });
  });
  it("no se puede borrar una imagen ajena", async () => {
    const a = await newUser();
    const b = await newUser();
    const img = await uploadAsset(h.db, a.id, root, "gallery", png());
    await expect(removeAsset(h.db, b.id, root, img.id)).rejects.toMatchObject({ code: "not_found" });
    await removeAsset(h.db, a.id, root, img.id);
  });
  it("el fondo del diseño debe ser una imagen de fondo propia", async () => {
    const a = await newUser();
    const b = await newUser();
    const bg = await uploadAsset(h.db, a.id, root, "background", png());
    const design = { ...DEFAULT_THEMES[0].design, background: { ...DEFAULT_THEMES[0].design.background, kind: "image" as const, assetId: bg.id } };
    await expect(saveDraft(h.db, b.id, design)).rejects.toMatchObject({ code: "bad_asset" });
    await saveDraft(h.db, a.id, design);
    await removeAsset(h.db, a.id, root, bg.id); // al borrar el fondo, el diseño vuelve al degradado
    expect((await getMySpace(h.db, a.id)).design.background).toMatchObject({ kind: "gradient", assetId: null });
  });
});

describe("diseño, borrador y publicación", () => {
  it("el borrador se guarda validado; no se publica hasta pulsar publicar; los cambios posteriores no afectan a lo publicado", async () => {
    const { id, username } = await newUser();
    await expect(saveDraft(h.db, id, { ...DEFAULT_THEMES[0].design, theme: "no-existe" })).rejects.toMatchObject({ code: "bad_theme" });
    await expect(saveDraft(h.db, id, { ...DEFAULT_THEMES[0].design, colors: { ...DEFAULT_THEMES[0].design.colors, bg: "red" } })).rejects.toThrow();
    const neon = DEFAULT_THEMES[1].design;
    await saveDraft(h.db, id, neon);
    expect(await getPublicSpace(h.db, username, null)).toBeNull(); // borrador: invisible para los demás
    await publishSpace(h.db, id, { requireVerified: false });
    expect((await getPublicSpace(h.db, username, null))?.design.theme).toBe("neon-rave");
    await saveDraft(h.db, id, DEFAULT_THEMES[3].design);
    expect((await getPublicSpace(h.db, username, null))?.design.theme).toBe("neon-rave"); // visitantes: lo publicado
    expect((await getPublicSpace(h.db, username, { id }, { preview: true }))?.design.theme).toBe("acid-house"); // dueño: previsualiza el borrador
    expect((await getMySpace(h.db, id)).dirty).toBe(true);
    await publishSpace(h.db, id, { requireVerified: false });
    expect((await getMySpace(h.db, id)).dirty).toBe(false);
    await unpublishSpace(h.db, id);
    expect(await getPublicSpace(h.db, username, null)).toBeNull();
  });
  it("con el correo activo, publicar exige haberlo confirmado", async () => {
    const mb = mailbox();
    const { id } = await newUser("exige_verif", mb.deps);
    await expect(publishSpace(h.db, id, { requireVerified: true })).rejects.toMatchObject({ code: "email_unverified" });
    await verifyEmail(h.db, mb.tokenOf());
    await publishSpace(h.db, id, { requireVerified: true });
  });
});

describe("vista pública y privacidad", () => {
  it("oculta ubicación, fecha, enlaces y favoritos según lo que decida la persona", async () => {
    const { id, username } = await newUser();
    await updateProfile(h.db, id, { displayName: "Pública", location: "Cali", links: { instagram: "https://instagram.com/x" }, privacy: { listed: true, showLocation: true, showJoined: true, showLinks: true, showFavorites: true } });
    await setFavoriteArtists(h.db, id, [{ name: "Banda" }]);
    await publishSpace(h.db, id, { requireVerified: false });
    const open = (await getPublicSpace(h.db, username, null))!;
    expect(open).toMatchObject({ location: "Cali", links: { instagram: "https://instagram.com/x" } });
    expect(open.joinedAt).not.toBeNull();
    expect(open.artists).toHaveLength(1);
    await updateProfile(h.db, id, { displayName: "Pública", privacy: { listed: false, showLocation: false, showJoined: false, showLinks: false, showFavorites: false } });
    const closed = (await getPublicSpace(h.db, username, null))!;
    expect(closed).toMatchObject({ location: null, joinedAt: null, links: {}, artists: [] });
    expect(JSON.stringify(closed)).not.toContain("example.com"); // nunca el correo
  });
  it("un nombre inválido o inexistente no revela nada; /@Usuario no distingue mayúsculas", async () => {
    expect(await getPublicSpace(h.db, "no_existe", null)).toBeNull();
    expect(await getPublicSpace(h.db, "../etc", null)).toBeNull();
    const { id, username } = await newUser();
    await publishSpace(h.db, id, { requireVerified: false });
    expect((await getPublicSpace(h.db, `@${username.toUpperCase()}`, null))?.username).toBe(username);
  });
});

describe("descubrimiento", () => {
  it("lista solo Spaces publicados que aceptan aparecer; busca por nombre y filtra por género; destacados aparte", async () => {
    const a = await newUser("desc_techno");
    const b = await newUser("desc_house");
    const c = await newUser("desc_oculto");
    await newUser("desc_borrador");
    await setGenres(h.db, a.id, ["techno"]);
    await setGenres(h.db, b.id, ["house"]);
    for (const x of [a, b, c]) await publishSpace(h.db, x.id, { requireVerified: false });
    await updateProfile(h.db, c.id, { displayName: "Oculto", privacy: { listed: false, showLocation: true, showJoined: true, showLinks: true, showFavorites: true } });
    await setFeatured(h.db, admin, b.id, true);
    const all = await listSpaces(h.db, { q: "desc_" });
    expect([...all.featured, ...all.recent].map((s) => s.username).sort()).toEqual(["desc_house", "desc_techno"]);
    expect(all.featured.map((s) => s.username)).toEqual(["desc_house"]);
    expect((await listSpaces(h.db, { genre: "techno", q: "desc_" })).recent.map((s) => s.username)).toEqual(["desc_techno"]);
    expect((await listSpaces(h.db, { q: "%" })).total).toBe(0); // los comodines se escapan
  });
});

describe("reportes y moderación", () => {
  it("cualquiera reporta un Space público; no el propio ni uno inexistente", async () => {
    const { id, username } = await newUser();
    await publishSpace(h.db, id, { requireVerified: false });
    await reportSpace(h.db, { username, reason: "spam", detail: "enlaces raros" }, null);
    await expect(reportSpace(h.db, { username, reason: "spam" }, id)).rejects.toMatchObject({ code: "self_report" });
    await expect(reportSpace(h.db, { username: "no_existe", reason: "spam" }, null)).rejects.toMatchObject({ code: "not_found" });
    await expect(reportSpace(h.db, { username, reason: "inventado" }, null)).rejects.toThrow();
    const open = await listReports(h.db, admin);
    expect(open.some((r) => r.username === username && r.reason === "spam")).toBe(true);
    await closeReport(h.db, admin, open.find((r) => r.username === username)!.id);
    expect((await h.db.select().from(spaceReports).where(eq(spaceReports.profileUserId, id)))[0].status).toBe("closed");
  });
  it("solo administración modera: oyentes, locutores y editorial no", async () => {
    const { id } = await newUser();
    const [oyente] = await h.db.select().from(users).where(eq(users.id, id));
    const loc: Actor = { id: "x", role: "locutor" };
    for (const who of [{ id: oyente.id, role: oyente.role } as Actor, loc, { id: "y", role: "editor" } as Actor]) {
      await expect(listSpacesAdmin(h.db, who)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setFeatured(h.db, who, id, true)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(setDisabled(h.db, who, id, true)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(addGenreOption(h.db, who, { slug: "x", name: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
  it("desactivar un Space lo retira del público y del listado, deja de servir sus imágenes y no se puede republicar", async () => {
    const { id, username } = await newUser();
    const img = await uploadAsset(h.db, id, root, "avatar", png());
    await publishSpace(h.db, id, { requireVerified: false });
    const { readSpaceAsset } = await import("@/modules/spaces/assets");
    expect(await readSpaceAsset(h.db, root, img.storageKey, null)).not.toBeNull();
    await setDisabled(h.db, admin, id, true, "incumple las normas");
    expect(await getPublicSpace(h.db, username, null)).toBeNull();
    expect(await getPublicSpace(h.db, username, { id })).toBeNull(); // ni su dueño lo ve público
    expect(await readSpaceAsset(h.db, root, img.storageKey, null)).toBeNull();
    expect((await listSpaces(h.db, { q: username })).total).toBe(0);
    await expect(publishSpace(h.db, id, { requireVerified: false })).rejects.toMatchObject({ code: "space_disabled" });
    await setDisabled(h.db, admin, id, false);
    await publishSpace(h.db, id, { requireVerified: false });
  });
  it("marcar una imagen la deja de servir; buscar perfiles por nombre o correo; géneros y plantillas", async () => {
    const { id, username } = await newUser();
    const img = await uploadAsset(h.db, id, root, "cover", png());
    await publishSpace(h.db, id, { requireVerified: false });
    const { readSpaceAsset } = await import("@/modules/spaces/assets");
    await flagAsset(h.db, admin, img.id, true);
    expect(await readSpaceAsset(h.db, root, img.storageKey, null)).toBeNull();
    expect(await readSpaceAsset(h.db, root, img.storageKey, id)).toBeNull(); // marcada: no se sirve ni al dueño
    expect((await listSpacesAdmin(h.db, admin, { q: `${username}@example` })).rows.map((r) => r.username)).toContain(username);
    await addGenreOption(h.db, admin, { slug: "dub-techno", name: "Dub Techno" });
    await expect(addGenreOption(h.db, admin, { slug: "dub-techno", name: "x" })).rejects.toMatchObject({ code: "genre_exists" });
    const themes = await h.db.select().from(spaceThemes);
    for (const t of themes.slice(0, 4)) await setThemeActive(h.db, admin, t.id, false);
    await expect(setThemeActive(h.db, admin, themes[4].id, false)).rejects.toMatchObject({ code: "last_theme" });
    for (const t of themes) await setThemeActive(h.db, admin, t.id, true);
  });
});
