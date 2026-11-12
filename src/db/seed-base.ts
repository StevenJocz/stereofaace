/**
 * Datos base que el sitio necesita en cualquier entorno (también en producción). Todo es idempotente
 * (`ON CONFLICT DO NOTHING`): se puede ejecutar en cada despliegue sin duplicar ni pisar cambios del administrador.
 * No contiene contenido de demostración.
 */
import type { Db } from "@/lib/db";
import { categories, genres } from "@/modules/taxonomy/schema";
import { siteSettings } from "@/modules/settings/schema";
import { seedRadioDefaults } from "./seed-radio";

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
}
