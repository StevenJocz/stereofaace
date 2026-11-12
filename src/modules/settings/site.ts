import { inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { siteSettings } from "./schema";
import { footerSchema, newsletterSchema, siteSchema, siteSettingsSchema, socialSchema, type SiteSettings } from "./site-validators";

export type { SiteSettings } from "./site-validators";

/** Los textos que la web mostraba antes de que fueran editables: sin ajustes guardados, nada cambia. */
export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  site: {
    name: "StereoFace",
    tagline: "electrónica, indie y cultura underground",
    description:
      "Plataforma cultural donde la música electrónica, el indie, el arte, la tecnología y la escena underground se encuentran.",
  },
  social: {},
  newsletter: { title: "Newsletter", text: "Una carta semanal con lo esencial de la escena." },
  footer: {
    text: "Una plataforma de música electrónica e indie donde la cultura, el sonido y la gente se conectan. Noticias, lanzamientos, entrevistas, eventos y más.",
  },
};

const KEYS = ["site", "social", "newsletter", "footer"] as const;
const PIECES = { site: siteSchema, social: socialSchema, newsletter: newsletterSchema, footer: footerSchema } as const;

/** Lectura pública. Un valor guardado inválido se ignora y se usa el predeterminado de esa clave. */
export async function getSiteSettings(db: Db): Promise<SiteSettings> {
  const rows = await db.select().from(siteSettings).where(inArray(siteSettings.key, [...KEYS]));
  const out: SiteSettings = structuredClone(DEFAULT_SITE_SETTINGS);
  for (const row of rows) {
    const key = row.key as (typeof KEYS)[number];
    const parsed = PIECES[key].safeParse(row.value);
    if (parsed.success) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}

/** Guarda los cuatro bloques de ajustes. En la auditoría solo se anotan las claves, no los valores. */
export async function saveSiteSettings(db: Db, actor: Actor | null, raw: unknown): Promise<void> {
  assertCan(actor, "setting:update");
  const input = siteSettingsSchema.parse(raw);
  for (const key of KEYS) {
    await db
      .insert(siteSettings)
      .values({ key, value: input[key], updatedBy: actor.id })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: sql`excluded.value`, updatedBy: actor.id },
      });
  }
  await recordAudit(db, { userId: actor.id, action: "settings.update", entity: "settings", diff: { keys: [...KEYS] } });
}
