/**
 * Contenido de demostración. Todo es ficticio y queda marcado con `is_demo = true`; la interfaz lo
 * identifica como DEMO. `seedDemo` es idempotente: borra lo demo anterior y lo vuelve a crear.
 */
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import type { CoverArt } from "@/modules/media/cover-art";
import { categories, genres } from "@/modules/taxonomy/schema";
import { artistGenres, artists } from "@/modules/artists/schema";
import { releaseArtists, releases, type ReleaseKind } from "@/modules/releases/schema";
import { eventArtists, events, type EventKind } from "@/modules/events/schema";
import { articles, homeBlocks, type HeroConfig } from "@/modules/content/schema";
import { radioStations } from "@/modules/radio/schema";
import { seedRadioDevTestStream } from "./seed-radio";
import { seedBase } from "./seed-base";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

type ArticleSeed = {
  title: string;
  kicker: string;
  category: string;
  hoursAgo: number;
  read: number;
  art: CoverArt;
  dek?: string;
};

const art = (scene: CoverArt["scene"], tone: CoverArt["tone"], seed: number): CoverArt => ({ scene, tone, seed });

const HERO: Array<ArticleSeed & { config: HeroConfig }> = [
  {
    title: "La noche que el club aprendió a escuchar",
    kicker: "Reportaje",
    category: "reportajes",
    hoursAgo: 3,
    read: 9,
    art: art("dj", "acid", 1),
    dek: "Texto de demostración: así se vería una nota principal con bajada. Nada de esto es una noticia real.",
    config: {
      lines: ["La noche", "que el club", "aprendió", "a escuchar"],
      accentFrom: 2,
      place: "4.7110° N · 74.0721° W · Bogotá, CO",
      cta: "Leer reportaje",
      meta: "Reportaje · 9 min",
      path: ["Música", "Cultura", "Escena"],
      figure: true,
    },
  },
  {
    title: "Segunda mano, primera fila",
    kicker: "Cultura",
    category: "cultura",
    hoursAgo: 6,
    read: 6,
    art: art("vinyl", "acid", 2),
    dek: "Texto de demostración sobre coleccionismo y bares de discos. Contenido ficticio para probar el diseño.",
    config: {
      lines: ["Segunda", "mano,", "primera", "fila"],
      accentFrom: 2,
      place: "6.2442° N · 75.5812° W · Medellín, CO",
      cta: "Leer reportaje",
      meta: "Cultura · 6 min",
      path: ["Música", "Vinilo", "Cultura"],
    },
  },
  {
    title: "Mil manos, una sola luz verde",
    kicker: "Eventos",
    category: "eventos",
    hoursAgo: 9,
    read: 4,
    art: art("crowd", "acid", 3),
    dek: "Texto de demostración sobre festivales y pistas de baile. Contenido ficticio para probar el diseño.",
    config: {
      lines: ["Mil manos", "una sola", "luz verde"],
      accentFrom: 1,
      place: "19.4326° N · 99.1332° W · CDMX, MX",
      cta: "Ver agenda",
      meta: "Eventos · 4 min",
      path: ["Música", "Festivales", "Escena"],
    },
  },
  {
    title: "Indie después de medianoche",
    kicker: "Entrevista",
    category: "entrevistas",
    hoursAgo: 12,
    read: 12,
    art: art("dj", "violet", 4),
    dek: "Texto de demostración sobre guitarras, casetes y cuartos de ensayo. Contenido ficticio para probar el diseño.",
    config: {
      lines: ["Indie", "después de", "media", "noche"],
      accentFrom: 2,
      place: "34.6037° S · 58.3816° W · Buenos Aires, AR",
      cta: "Leer entrevista",
      meta: "Entrevista · 12 min",
      path: ["Música", "Indie", "Escena"],
    },
  },
];

const FEATURES: ArticleSeed[] = [
  {
    title: "El renacer del techno latino",
    kicker: "Reportaje",
    category: "reportajes",
    hoursAgo: 20,
    read: 9,
    art: art("crowd", "acid", 41),
  },
  {
    title: "Diez discos indie esperados del año",
    kicker: "Lista",
    category: "listas",
    hoursAgo: 30,
    read: 6,
    art: art("dj", "violet", 42),
  },
  {
    title: "Equipos esenciales para producir en casa",
    kicker: "Guía",
    category: "guias",
    hoursAgo: 40,
    read: 5,
    art: art("vinyl", "acid", 43),
  },
  {
    title: "Festivales que no te puedes perder",
    kicker: "Eventos",
    category: "eventos",
    hoursAgo: 50,
    read: 7,
    art: art("peaks", "mono", 44),
  },
];

const FEED: ArticleSeed[] = [
  {
    title: "Los clubes que cambiaron la noche",
    kicker: "Noticia",
    category: "noticias",
    hoursAgo: 2,
    read: 3,
    art: art("crowd", "acid", 31),
  },
  {
    title: "Un álbum que expande sus fronteras sonoras",
    kicker: "Lanzamiento",
    category: "lanzamientos",
    hoursAgo: 5,
    read: 4,
    art: art("dj", "mono", 32),
  },
  {
    title: "El festival indie que pone a la ciudad en el mapa",
    kicker: "Evento",
    category: "eventos",
    hoursAgo: 8,
    read: 3,
    art: art("peaks", "acid", 33),
  },
  {
    title: "Techno de madrugada y la geografía de la pista",
    kicker: "Electrónica",
    category: "electronica",
    hoursAgo: 11,
    read: 5,
    art: art("halftone", "acid", 51),
    dek: "Bajada de ejemplo en tipografía editorial para lectura.",
  },
  {
    title: "Shoegaze desde la altura de la ciudad",
    kicker: "Indie",
    category: "indie",
    hoursAgo: 14,
    read: 4,
    art: art("rings", "violet", 52),
  },
  {
    title: "«Siempre quise que el ruido tuviera estructura»",
    kicker: "Entrevista",
    category: "entrevistas",
    hoursAgo: 28,
    read: 12,
    art: art("wave", "acid", 53),
  },
  {
    title: "La pista de baile como archivo vivo",
    kicker: "Cultura",
    category: "cultura",
    hoursAgo: 52,
    read: 6,
    art: art("grid", "violet", 54),
  },
  {
    title: "Tres ciudades, un mismo bajo",
    kicker: "Escena latinoamericana",
    category: "cultura",
    hoursAgo: 56,
    read: 8,
    art: art("peaks", "acid", 55),
  },
];

const BY_CATEGORY: Array<{ category: string; items: Array<[string, string, number]> }> = [
  {
    category: "electronica",
    items: [
      ["Capas de arpegio y silencio calculado", "Melodic techno", 80],
      ["Grabaciones de campo como instrumento", "Ambient", 104],
      ["El groove que cambió de ciudad", "House", 128],
    ],
  },
  {
    category: "indie",
    items: [
      ["Guitarras angulosas y letras cortas", "Post-punk", 84],
      ["Estribillos que se cuelan sin avisar", "Indie pop", 108],
      ["Una banda, un garaje, un casete", "Alternativo", 132],
    ],
  },
];

const ARTISTS: Array<{ name: string; country: string; genre: string; art: CoverArt }> = [
  { name: "Artista Demo 01", country: "CO", genre: "techno", art: art("dj", "acid", 61) },
  { name: "Banda Demo 02", country: "MX", genre: "shoegaze", art: art("rings", "violet", 62) },
  { name: "Artista Demo 03", country: "AR", genre: "ambient", art: art("wave", "mono", 63) },
  { name: "Banda Demo 04", country: "CL", genre: "post-punk", art: art("vinyl", "violet", 64) },
];

const RELEASES: Array<{ title: string; kind: ReleaseKind; days: number; label: string; artist: number }> = [
  { title: "Título demo I", kind: "album", days: 4, label: "Sello Demo", artist: 0 },
  { title: "Título demo II", kind: "ep", days: 4, label: "Sello Demo", artist: 1 },
  { title: "Título demo III", kind: "single", days: 11, label: "Independiente", artist: 2 },
  { title: "Título demo IV", kind: "remix", days: 11, label: "Sello Demo", artist: 3 },
  { title: "Sesión demo V", kind: "set", days: 18, label: "Radio Demo", artist: 0 },
  { title: "Episodio demo VI", kind: "podcast", days: 18, label: "StereoFace", artist: 1 },
];

const EVENTS: Array<{ name: string; city: string; country: string; days: number; genre: string; kind: EventKind }> = [
  { name: "Evento demo A", city: "Bogotá", country: "CO", days: 11, genre: "techno", kind: "rave" },
  { name: "Evento demo B", city: "Medellín", country: "CO", days: 18, genre: "house", kind: "festival" },
  { name: "Evento demo C", city: "Ciudad de México", country: "MX", days: 25, genre: "indie-pop", kind: "concierto" },
  { name: "Evento demo D", city: "Buenos Aires", country: "AR", days: 32, genre: "ambient", kind: "presentacion" },
  { name: "Evento demo E", city: "Santiago", country: "CL", days: 39, genre: "post-punk", kind: "concierto" },
  { name: "Evento demo F", city: "Lima", country: "PE", days: 60, genre: "experimental", kind: "underground" },
];

const demoBody = (title: string) =>
  `<p><strong>Contenido de demostración.</strong> «${title}» es un texto ficticio para probar el diseño; no es una noticia real.</p>`;

export async function seedDemo(
  db: Db,
  now = new Date(),
  options: { devTestStream?: boolean } = {},
): Promise<{ articles: number }> {
  // 1) Limpiar lo demo anterior (los bloques de portada caen en cascada con sus artículos).
  await db.delete(articles).where(eq(articles.isDemo, true));
  await db.delete(artists).where(eq(artists.isDemo, true));
  await db.delete(releases).where(eq(releases.isDemo, true));
  await db.delete(events).where(eq(events.isDemo, true));
  await db.delete(radioStations).where(eq(radioStations.isDemo, true));

  // 2) Datos base (taxonomía, The Lot Radio desactivada, ajustes): idempotentes y válidos también en producción.
  await seedBase(db);
  const cat = new Map((await db.select().from(categories)).map((c) => [c.slug, c.id]));
  const gen = new Map((await db.select().from(genres)).map((g) => [g.slug, g.id]));

  // 3) Artículos.
  const make = (a: ArticleSeed, extra: Partial<typeof articles.$inferInsert> = {}) => ({
    slug: slugify(a.title),
    title: a.title,
    kicker: a.kicker,
    dek: a.dek,
    bodyHtml: demoBody(a.title),
    categoryId: cat.get(a.category),
    status: "published" as const,
    publishedAt: new Date(now.getTime() - a.hoursAgo * HOUR),
    readMinutes: a.read,
    coverArt: a.art,
    authorName: "Redacción Demo",
    origin: "manual" as const,
    isDemo: true,
    ...extra,
  });

  const heroRows = await db
    .insert(articles)
    .values(HERO.map((h) => make(h)))
    .returning({ id: articles.id });
  const featureRows = await db
    .insert(articles)
    .values(FEATURES.map((f) => make(f)))
    .returning({ id: articles.id });
  await db.insert(articles).values(FEED.map((f) => make(f)));
  const grouped: ArticleSeed[] = BY_CATEGORY.flatMap((g) =>
    g.items.map(([title, kicker, hoursAgo], i) => ({
      title,
      kicker,
      category: g.category,
      hoursAgo,
      read: 4 + i,
      art: art(
        g.category === "indie" ? "rings" : "halftone",
        g.category === "indie" ? "violet" : "acid",
        200 + hoursAgo,
      ),
    })),
  );
  await db.insert(articles).values(grouped.map((g) => make(g)));

  // 4) Bloques de portada.
  await db
    .insert(homeBlocks)
    .values([
      ...heroRows.map((r, i) => ({ kind: "hero" as const, position: i, articleId: r.id, config: HERO[i].config })),
      ...featureRows.map((r, i) => ({ kind: "feature" as const, position: i, articleId: r.id, config: {} })),
    ]);

  // 5) Artistas, lanzamientos y eventos.
  const artistRows = await db
    .insert(artists)
    .values(
      ARTISTS.map((a) => ({
        slug: slugify(a.name),
        name: a.name,
        country: a.country,
        coverArt: a.art,
        bio: "Perfil de demostración: artista ficticia.",
        featured: true,
        isDemo: true,
      })),
    )
    .returning({ id: artists.id });
  await db
    .insert(artistGenres)
    .values(artistRows.map((r, i) => ({ artistId: r.id, genreId: gen.get(ARTISTS[i].genre)! })));

  const releaseRows = await db
    .insert(releases)
    .values(
      RELEASES.map((r) => ({
        slug: slugify(r.title),
        title: r.title,
        kind: r.kind,
        releasedAt: new Date(now.getTime() + r.days * DAY),
        label: r.label,
        status: "published" as const,
        isDemo: true,
        coverArt: ARTISTS[r.artist].art,
      })),
    )
    .returning({ id: releases.id });
  await db
    .insert(releaseArtists)
    .values(releaseRows.map((r, i) => ({ releaseId: r.id, artistId: artistRows[RELEASES[i].artist].id, position: 0 })));

  const eventRows = await db
    .insert(events)
    .values(
      EVENTS.map((e) => ({
        slug: slugify(e.name),
        name: e.name,
        kind: e.kind,
        startsAt: new Date(now.getTime() + e.days * DAY),
        city: e.city,
        country: e.country,
        description: "Evento de demostración: ficticio.",
        genreId: gen.get(e.genre),
        status: "published" as const,
        isDemo: true,
      })),
    )
    .returning({ id: events.id });
  await db
    .insert(eventArtists)
    .values(eventRows.map((r, i) => ({ eventId: r.id, artistId: artistRows[i % artistRows.length].id, position: 0 })));

  // 6) Señal de prueba de la radio: solo desarrollo.
  if (options.devTestStream ?? process.env.NODE_ENV !== "production") await seedRadioDevTestStream(db);

  const total = await db
    .select({ id: articles.id })
    .from(articles)
    .where(inArray(articles.categoryId, [...cat.values()]));
  return { articles: total.length };
}
