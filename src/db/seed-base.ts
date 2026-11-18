/**
 * Datos base que el sitio necesita en cualquier entorno (también en producción). Todo es idempotente
 * (`ON CONFLICT DO NOTHING`): se puede ejecutar en cada despliegue sin duplicar ni pisar cambios del administrador.
 * No contiene contenido de demostración.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { categories, genres } from "@/modules/taxonomy/schema";
import { pages } from "@/modules/content/schema";
import { siteSettings } from "@/modules/settings/schema";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { LEGAL_PAGES } from "./legal-pages";
import { seedRadioDefaults } from "./seed-radio";
import { spaceGenreOptions, spaceThemes } from "@/modules/spaces/schema";
import { DEFAULT_GENRE_OPTIONS, DEFAULT_THEMES } from "@/modules/spaces/defaults";

export const CATEGORIES = [
  ["noticias", "Noticias"],
  ["electronica", "Electrónica"],
  ["indie", "Indie"],
  ["cultura", "Cultura"],
  ["entrevistas", "Entrevistas"],
  ["tecnologia", "Tecnología musical"],
  ["reportajes", "Reportajes"],
  ["listas", "Listas"],
  ["guias", "Guías"],
  ["eventos", "Eventos"],
  ["lanzamientos", "Lanzamientos"],
] as const;

export const GENRES = [
  ["techno", "Techno", "electronica"],
  ["house", "House", "electronica"],
  ["melodic-techno", "Melodic techno", "electronica"],
  ["ambient", "Ambient", "electronica"],
  ["experimental", "Experimental", "electronica"],
  ["shoegaze", "Shoegaze", "indie"],
  ["post-punk", "Post-punk", "indie"],
  ["indie-pop", "Indie pop", "indie"],
  ["alternativo", "Alternativo", "indie"],
] as const;

export async function seedBase(db: Db): Promise<void> {
  await db
    .insert(categories)
    .values(CATEGORIES.map(([slug, name], position) => ({ slug, name, position })))
    .onConflictDoNothing();
  await db
    .insert(genres)
    .values(GENRES.map(([slug, name, family]) => ({ slug, name, family })))
    .onConflictDoNothing();
  // The Lot Radio: registro DESACTIVADO, autorización pendiente y sin URL de señal.
  await seedRadioDefaults(db);
  await db
    .insert(siteSettings)
    .values({ key: "site", value: { name: "StereoFace", tagline: "Electrónica, indie y cultura underground" } })
    .onConflictDoNothing();
  // Páginas legales base: solo se crean si no existen (no se pisa lo que se edite en el panel).
  await db
    .insert(pages)
    .values(
      LEGAL_PAGES.map((p) => ({
        slug: p.slug,
        locale: "es",
        title: p.title,
        bodyHtml: sanitizeArticleHtml(p.html.trim()),
        status: "published" as const,
        seo: { title: p.title, description: p.description },
      })),
    )
    .onConflictDoNothing();
  // StereoFace Spaces: géneros elegibles y las cinco plantillas iniciales (el administrador puede cambiarlas después).
  await db
    .insert(spaceGenreOptions)
    .values(DEFAULT_GENRE_OPTIONS.map(([slug, name], position) => ({ slug, name, position })))
    .onConflictDoNothing();
  await db
    .insert(spaceThemes)
    .values(DEFAULT_THEMES.map((t, position) => ({ slug: t.slug, name: t.name, description: t.description, design: t.design, position })))
    .onConflictDoNothing();
  // Las plantillas que ya existían (editables por el administrador) reciben su portada prediseñada solo si aún no tienen ninguna.
  for (const t of DEFAULT_THEMES) {
    await db
      .update(spaceThemes)
      .set({ design: sql`${spaceThemes.design} || ${JSON.stringify({ cover: t.design.cover })}::jsonb` })
      .where(and(eq(spaceThemes.slug, t.slug), sql`${spaceThemes.design} -> 'cover' is null`));
  }
}
