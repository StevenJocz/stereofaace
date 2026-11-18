import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { artists } from "@/modules/artists/schema";
import { users } from "@/modules/users/schema";
import { DEFAULT_THEMES } from "./defaults";
import { designSchema, safeUrl, type SpaceDesign } from "./design";
import { followCounts } from "./follows";
import { DEFAULT_PRIVACY, spaceAssets, spaceFavoriteArtists, spaceGenreOptions, spaceProfileGenres, spaceProfiles, spaceThemes, type SpaceLinks, type SpacePrivacy } from "./schema";
import { usernameSchema } from "./username";

export const assetUrl = (storageKey: string) => `/s/${storageKey}`;
/** Texto de varias líneas (biografía): permite saltos de línea, no otros caracteres de control. */
const multiline = (max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(max).refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s), "Texto no válido"));
const text = (max: number) => z.string().trim().max(max).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Texto no válido");

const LINK_KEYS = ["instagram", "x", "tiktok", "facebook", "youtube", "spotify", "soundcloud", "bandcamp", "web"] as const;
const linksSchema = z
  .object(Object.fromEntries(LINK_KEYS.map((k) => [k, z.string().trim().max(300).optional()])) as Record<(typeof LINK_KEYS)[number], z.ZodOptional<z.ZodString>>)
  .strict()
  .transform((l, ctx) => {
    const out: SpaceLinks = {};
    for (const k of LINK_KEYS) {
      const v = l[k];
      if (!v) continue;
      // Las redes admiten solo su propio dominio; «web» admite cualquier sitio https.
      const safe = safeUrl(v, k === "web" ? null : k === "x" ? ["x.com", "twitter.com"] : k === "youtube" ? ["youtube.com", "youtu.be"] : [`${k}.com`, ...(k === "instagram" ? [] : [])]);
      if (!safe) ctx.addIssue({ code: "custom", message: `El enlace de ${k} no es válido (usa https y el dominio de esa red)`, path: [k] });
      else out[k] = safe;
    }
    return out;
  });

const privacySchema = z.object({ listed: z.boolean(), showLocation: z.boolean(), showJoined: z.boolean(), showLinks: z.boolean(), showFavorites: z.boolean(), showFollows: z.boolean().default(true) }).strict();

export const profileSchema = z.object({
  displayName: text(40).refine((s) => s.length >= 1, "Escribe cómo quieres que te vean"),
  bio: multiline(500).optional(),
  location: text(60).optional(),
  tagline: text(120).optional(),
  links: linksSchema.optional(),
  privacy: privacySchema.optional(),
});

const clean = (s: string | undefined) => (s && s.trim() !== "" ? s.trim() : null);

async function profileOf(db: Db, userId: string) {
  const [p] = await db.select().from(spaceProfiles).where(eq(spaceProfiles.userId, userId));
  if (!p) throw new DomainError("no_profile", "Esta cuenta no tiene un Space.");
  return p;
}

export type MySpace = {
  profile: { username: string; displayName: string; bio: string | null; location: string | null; tagline: string | null; links: SpaceLinks; privacy: SpacePrivacy; status: string; featured: boolean; publishedAt: string | null; joinedAt: string; verified: boolean };
  design: SpaceDesign;
  follows: { followers: number; following: number };
  dirty: boolean;
  genres: string[];
  artists: { artistId: string | null; name: string }[];
  assets: { id: string; kind: string; url: string; alt: string | null }[];
  avatarUrl: string | null;
  coverUrl: string | null;
  options: { genres: { slug: string; name: string }[]; themes: { slug: string; name: string; description: string | null; design: SpaceDesign }[] };
};

export async function getMySpace(db: Db, userId: string): Promise<MySpace> {
  const p = await profileOf(db, userId);
  const [u, genreRows, artistRows, assetRows, genreOptions, themes, follows] = await Promise.all([
    db.select({ createdAt: users.createdAt, verified: users.emailVerifiedAt, role: users.role }).from(users).where(eq(users.id, userId)),
    db.select({ slug: spaceGenreOptions.slug }).from(spaceProfileGenres).innerJoin(spaceGenreOptions, eq(spaceGenreOptions.id, spaceProfileGenres.genreId)).where(eq(spaceProfileGenres.userId, userId)).orderBy(asc(spaceProfileGenres.position)),
    db.select({ artistId: spaceFavoriteArtists.artistId, name: spaceFavoriteArtists.name }).from(spaceFavoriteArtists).where(eq(spaceFavoriteArtists.userId, userId)).orderBy(asc(spaceFavoriteArtists.position)),
    db.select().from(spaceAssets).where(and(eq(spaceAssets.userId, userId), eq(spaceAssets.status, "ok"))).orderBy(asc(spaceAssets.position), asc(spaceAssets.createdAt)),
    db.select({ slug: spaceGenreOptions.slug, name: spaceGenreOptions.name }).from(spaceGenreOptions).where(eq(spaceGenreOptions.active, true)).orderBy(asc(spaceGenreOptions.position)),
    db.select().from(spaceThemes).where(eq(spaceThemes.active, true)).orderBy(asc(spaceThemes.position)),
    followCounts(db, userId),
  ]);
  const design = p.draftDesign ?? p.publishedDesign ?? DEFAULT_THEMES[0].design;
  const url = (id: string | null) => {
    const a = assetRows.find((x) => x.id === id);
    return a ? assetUrl(a.storageKey) : null;
  };
  return {
    profile: {
      username: p.username,
      displayName: p.displayName,
      bio: p.bio,
      location: p.location,
      tagline: p.tagline,
      links: p.links,
      privacy: { ...DEFAULT_PRIVACY, ...p.privacy },
      status: p.status,
      featured: p.featured,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      joinedAt: (u[0]?.createdAt ?? p.createdAt).toISOString(),
      verified: Boolean(u[0]?.verified) || u[0]?.role !== "oyente",
    },
    design,
    follows,
    dirty: JSON.stringify(p.draftDesign) !== JSON.stringify(p.publishedDesign) || p.status !== "published",
    genres: genreRows.map((g) => g.slug),
    artists: artistRows,
    assets: assetRows.map((a) => ({ id: a.id, kind: a.kind, url: assetUrl(a.storageKey), alt: a.alt })),
    avatarUrl: url(p.avatarAssetId),
    coverUrl: url(p.coverAssetId),
    options: { genres: genreOptions, themes: themes.map((t) => ({ slug: t.slug, name: t.name, description: t.description, design: t.design })) },
  };
}

export async function updateProfile(db: Db, userId: string, raw: unknown): Promise<void> {
  const input = profileSchema.parse(raw);
  await profileOf(db, userId);
  await db
    .update(spaceProfiles)
    .set({
      displayName: input.displayName,
      bio: clean(input.bio),
      location: clean(input.location),
      tagline: clean(input.tagline),
      ...(input.links ? { links: input.links } : {}),
      ...(input.privacy ? { privacy: input.privacy } : {}),
    })
    .where(eq(spaceProfiles.userId, userId));
  await db.update(users).set({ name: input.displayName }).where(eq(users.id, userId));
}

export async function updateUsername(db: Db, userId: string, raw: unknown): Promise<{ username: string }> {
  const username = usernameSchema.parse(raw);
  const p = await profileOf(db, userId);
  if (p.username === username) return { username };
  const [taken] = await db.select({ id: spaceProfiles.userId }).from(spaceProfiles).where(sql`lower(${spaceProfiles.username}) = ${username}`).limit(1);
  if (taken) throw new DomainError("username_taken", "Ese nombre de usuario ya está en uso.");
  try {
    await db.update(spaceProfiles).set({ username }).where(eq(spaceProfiles.userId, userId));
  } catch {
    throw new DomainError("username_taken", "Ese nombre de usuario ya está en uso.");
  }
  return { username };
}

/** Guarda el borrador del diseño (autoguardado). El fondo debe ser una imagen de esta misma persona. */
export async function saveDraft(db: Db, userId: string, raw: unknown): Promise<SpaceDesign> {
  const design = designSchema.parse(raw);
  await profileOf(db, userId);
  if (design.background.assetId) {
    const [a] = await db.select({ id: spaceAssets.id }).from(spaceAssets).where(and(eq(spaceAssets.id, design.background.assetId), eq(spaceAssets.userId, userId), eq(spaceAssets.kind, "background"), eq(spaceAssets.status, "ok")));
    if (!a) throw new DomainError("bad_asset", "La imagen de fondo no existe o no es tuya.");
  }
  const [t] = await db.select({ id: spaceThemes.id }).from(spaceThemes).where(eq(spaceThemes.slug, design.theme));
  if (!t) throw new DomainError("bad_theme", "Esa plantilla no existe.");
  await db.update(spaceProfiles).set({ draftDesign: design }).where(eq(spaceProfiles.userId, userId));
  return design;
}

export async function setGenres(db: Db, userId: string, raw: unknown): Promise<string[]> {
  const slugs = z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40)).max(8).parse(raw);
  const unique = [...new Set(slugs)];
  await profileOf(db, userId);
  const options = unique.length ? await db.select({ id: spaceGenreOptions.id, slug: spaceGenreOptions.slug }).from(spaceGenreOptions).where(and(inArray(spaceGenreOptions.slug, unique), eq(spaceGenreOptions.active, true))) : [];
  if (options.length !== unique.length) throw new DomainError("bad_genre", "Alguno de los géneros no existe.");
  await db.delete(spaceProfileGenres).where(eq(spaceProfileGenres.userId, userId));
  if (unique.length) await db.insert(spaceProfileGenres).values(unique.map((slug, position) => ({ userId, genreId: options.find((o) => o.slug === slug)!.id, position })));
  return unique;
}

const artistSchema = z.array(z.object({ artistId: z.uuid().nullable().optional(), name: text(60).optional() }).strict()).max(12);

export async function setFavoriteArtists(db: Db, userId: string, raw: unknown): Promise<void> {
  const items = artistSchema.parse(raw);
  await profileOf(db, userId);
  const ids = items.flatMap((i) => (i.artistId ? [i.artistId] : []));
  const catalog = ids.length ? await db.select({ id: artists.id, name: artists.name }).from(artists).where(inArray(artists.id, ids)) : [];
  const rows: { userId: string; artistId: string | null; name: string; position: number }[] = [];
  for (const i of items) {
    const hit = i.artistId ? catalog.find((c) => c.id === i.artistId) : undefined;
    if (i.artistId && !hit) throw new DomainError("bad_artist", "Alguno de los artistas ya no existe en el catálogo.");
    const name = hit?.name ?? i.name?.trim();
    if (!name) continue;
    rows.push({ userId, artistId: hit?.id ?? null, name, position: rows.length });
  }
  await db.delete(spaceFavoriteArtists).where(eq(spaceFavoriteArtists.userId, userId));
  if (rows.length) await db.insert(spaceFavoriteArtists).values(rows);
}

/** Catálogo de StereoFace para el selector de artistas favoritos. */
export async function searchCatalogArtists(db: Db, q: string): Promise<{ id: string; name: string }[]> {
  const term = q.trim().slice(0, 40);
  if (term.length < 2) return [];
  return db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(and(sql`${artists.deletedAt} is null`, sql`${artists.name} ilike ${"%" + term.replace(/[%_\\]/g, "\\$&") + "%"}`))
    .orderBy(asc(artists.name))
    .limit(8);
}

export async function publishSpace(db: Db, userId: string, opts: { requireVerified: boolean }): Promise<void> {
  const p = await profileOf(db, userId);
  if (p.status === "disabled") throw new DomainError("space_disabled", "Tu Space fue desactivado por incumplir las normas. Escribe a StereoFace si crees que es un error.");
  if (opts.requireVerified) {
    const [u] = await db.select({ v: users.emailVerifiedAt, role: users.role }).from(users).where(eq(users.id, userId));
    // El personal (locutores, editorial, administración) lo creó quien administra: su correo ya es de confianza.
    if (!u?.v && u?.role === "oyente") throw new DomainError("email_unverified", "Confirma tu correo para publicar tu Space (revisa tu bandeja de entrada).");
  }
  if (!p.draftDesign) throw new DomainError("no_design", "Elige una plantilla antes de publicar.");
  await db.update(spaceProfiles).set({ status: "published", publishedDesign: p.draftDesign, publishedAt: new Date() }).where(eq(spaceProfiles.userId, userId));
}

export async function unpublishSpace(db: Db, userId: string): Promise<void> {
  const p = await profileOf(db, userId);
  if (p.status === "published") await db.update(spaceProfiles).set({ status: "draft" }).where(eq(spaceProfiles.userId, userId));
}
