import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { siteSettings } from "./schema";

const KEY = "ads";

export type AdsConfig = { enabled: boolean; publisherId: string; slotHome: string; slotArticle: string };
const OFF: AdsConfig = { enabled: false, publisherId: "", slotHome: "", slotArticle: "" };

const publisher = z.union([z.literal(""), z.string().trim().regex(/^ca-pub-\d{16}$/, "Debe verse así: ca-pub-1234567890123456")]);
const slot = z.union([z.literal(""), z.string().trim().regex(/^\d{6,12}$/, "Solo números (el ID del bloque de anuncios)")]);

export const adsInputSchema = z
  .object({ enabled: z.boolean(), publisherId: publisher.default(""), slotHome: slot.default(""), slotArticle: slot.default("") })
  .refine((v) => !v.enabled || v.publisherId !== "", { message: "Para activar la publicidad escribe tu ID de editor de AdSense", path: ["publisherId"] });
export type AdsInput = z.input<typeof adsInputSchema>;

/** Lectura pública (el ID de editor es público en cualquier página con anuncios). Sin ID válido, la publicidad queda apagada. */
export async function getAdsConfig(db: Db): Promise<AdsConfig> {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, KEY));
  const parsed = adsInputSchema.safeParse(row?.value);
  if (!parsed.success) return { ...OFF };
  const v = parsed.data;
  return { enabled: v.enabled && v.publisherId !== "", publisherId: v.publisherId, slotHome: v.slotHome, slotArticle: v.slotArticle };
}

export async function saveAdsConfig(db: Db, actor: Actor | null, raw: AdsInput): Promise<void> {
  assertCan(actor, "setting:update");
  const value = adsInputSchema.parse(raw);
  await db
    .insert(siteSettings)
    .values({ key: KEY, value, updatedBy: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id } });
  await recordAudit(db, { userId: actor.id, action: "ads.update", entity: "settings", diff: { enabled: value.enabled } });
}

/** Contenido de /ads.txt: autoriza a Google a vender publicidad en el dominio. `null` si no hay publicidad activa. */
export function adsTxtFor(cfg: AdsConfig): string | null {
  if (!cfg.enabled || !cfg.publisherId) return null;
  return `google.com, ${cfg.publisherId.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`;
}
