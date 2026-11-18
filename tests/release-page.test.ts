import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { artists, media, users } from "@/db/schema";
import { createRelease, deleteRelease } from "@/modules/releases/admin";
import { releaseEmbed } from "@/modules/releases/embed";
import { getReleasePage, listReleaseSlugs } from "@/modules/releases/service";
import { makeDb } from "./helpers";

let h: DbHandle;
let editor: Actor;
let a1: string;
let a2: string;
let cover: string;
const ID = "4aawyAB9vmqN3uQ7FjRGTy"; // 22 caracteres
const base = (over: Record<string, unknown> = {}) => ({ title: "Disco Uno", kind: "album", releasedAt: new Date(), artistIds: [a1], status: "published", ...over });

beforeAll(async () => {
  h = await makeDb();
  const [u] = await h.db.insert(users).values({ email: "ed@example.com", name: "ed", role: "editor" }).returning();
  editor = { id: u.id, role: u.role };
  [{ id: a1 }, { id: a2 }] = await h.db.insert(artists).values([{ slug: "uno", name: "Uno" }, { slug: "dos", name: "Dos" }]).returning();
  [{ id: cover }] = await h.db.insert(media).values({ storageKey: "lanz/portada.jpg", mime: "image/jpeg", bytes: 1000, alt: "Portada", credit: "Sello" }).returning();
});
afterAll(() => h.close());

describe("reproductor del lanzamiento (incrustado)", () => {
  it("Spotify: construye el iframe desde el id validado, con la altura según el tipo", () => {
    expect(releaseEmbed(`https://open.spotify.com/album/${ID}?si=zzz`, "X")).toMatchObject({ kind: "frame", provider: "Spotify", src: `https://open.spotify.com/embed/album/${ID}`, height: 352 });
    expect(releaseEmbed(`https://open.spotify.com/intl-es/playlist/${ID}`, "X")).toMatchObject({ src: `https://open.spotify.com/embed/playlist/${ID}` });
    expect(releaseEmbed(`https://open.spotify.com/track/${ID}`, "X")).toMatchObject({ height: 152 });
    expect(releaseEmbed(`https://open.spotify.com/embed/album/${ID}`, "X")).toMatchObject({ src: `https://open.spotify.com/embed/album/${ID}` });
  });
  it("Spotify con un id raro no se incrusta: se ofrece como enlace", () => {
    expect(releaseEmbed("https://open.spotify.com/album/corto", "X")).toMatchObject({ kind: "link" });
    expect(releaseEmbed(`https://open.spotify.com/user/alguien`, "X")).toMatchObject({ kind: "link" });
  });
  it("YouTube, SoundCloud, Apple Music, Mixcloud y Bandcamp", () => {
    expect(releaseEmbed("https://youtu.be/dQw4w9WgXcQ", "X")).toMatchObject({ kind: "frame", provider: "YouTube", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0" });
    expect(releaseEmbed("https://soundcloud.com/artista/tema", "X")).toMatchObject({ provider: "SoundCloud", src: expect.stringContaining("https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fartista%2Ftema") });
    expect(releaseEmbed("https://music.apple.com/co/album/x/123", "X")).toMatchObject({ src: "https://embed.music.apple.com/co/album/x/123" });
    expect(releaseEmbed("https://www.mixcloud.com/dj/set/", "X")).toMatchObject({ provider: "Mixcloud", src: expect.stringContaining("https://www.mixcloud.com/widget/iframe/?feed=%2Fdj%2Fset%2F") });
    expect(releaseEmbed("https://artista.bandcamp.com/album/x", "X")).toMatchObject({ kind: "link" });
    expect(releaseEmbed("https://bandcamp.com/EmbeddedPlayer/album=1/size=large", "X")).toMatchObject({ kind: "frame", provider: "Bandcamp" });
  });
  it("nada de http, hosts falsos, javascript: ni vacío", () => {
    for (const u of ["http://open.spotify.com/album/" + ID, "https://open.spotify.com.evil.io/album/" + ID, "javascript:alert(1)", "https://evil.example/x", "https://u:p@open.spotify.com/album/" + ID, "", null, undefined]) {
      expect(releaseEmbed(u as string, "X"), String(u)).toBeNull();
    }
  });
});

describe("ficha pública del lanzamiento", () => {
  it("trae portada, texto corto, artistas con enlace y el reproductor guardado", async () => {
    const { slug } = await createRelease(h.db, editor, base({ label: "Sello X", description: "Un disco corto y directo.", coverId: cover, embedUrl: `https://open.spotify.com/album/${ID}`, artistIds: [a1, a2] }));
    const r = await getReleasePage(h.db, slug);
    expect(r).toMatchObject({ title: "Disco Uno", label: "Sello X", description: "Un disco corto y directo.", coverUrl: "/media/lanz/portada.jpg", embedUrl: `https://open.spotify.com/album/${ID}` });
    expect(r!.coverCredit).toMatchObject({ credit: "Sello" });
    expect(r!.artists.map((a) => a.name)).toEqual(["Uno", "Dos"]);
  });
  it("sin portada subida usa la ilustración; sin texto, description es null", async () => {
    const { slug } = await createRelease(h.db, editor, base({ title: "Sin Portada", coverArt: { scene: "vinyl", tone: "violet", seed: 2 } }));
    const r = await getReleasePage(h.db, slug);
    expect(r!.coverUrl).toBeNull();
    expect(r!.coverArt).toMatchObject({ scene: "vinyl" });
    expect(r!.description).toBeNull();
  });
  it("rechaza un texto de más de 600 caracteres", async () => {
    await expect(createRelease(h.db, editor, base({ title: "Largo", description: "x".repeat(601) }))).rejects.toThrow();
  });
  it("borradores y borrados no existen; «más de» muestra otros lanzamientos de los mismos artistas", async () => {
    const draft = await createRelease(h.db, editor, base({ title: "Borrador", status: "draft" }));
    expect(await getReleasePage(h.db, draft.slug)).toBeNull();
    const del = await createRelease(h.db, editor, base({ title: "Borrado" }));
    await deleteRelease(h.db, editor, del.id);
    expect(await getReleasePage(h.db, del.slug)).toBeNull();
    const main = await createRelease(h.db, editor, base({ title: "Principal" }));
    const r = await getReleasePage(h.db, main.slug);
    const titles = r!.more.map((m) => m.title);
    expect(titles).toContain("Disco Uno");
    expect(titles).not.toContain("Principal");
    expect(titles).not.toContain("Borrador");
    expect(titles).not.toContain("Borrado");
    expect(await getReleasePage(h.db, "no-existe")).toBeNull();
  });
  it("el mapa del sitio solo lista lanzamientos publicados", async () => {
    const slugs = (await listReleaseSlugs(h.db)).map((s) => s.slug);
    expect(slugs).toContain("disco-uno");
    expect(slugs).not.toContain("borrador");
  });
});
