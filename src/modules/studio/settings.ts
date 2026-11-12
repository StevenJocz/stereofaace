import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { publicHttpUrlSchema } from "@/lib/validation";
import { siteSettings } from "@/modules/settings/schema";
import { recordAudit } from "@/modules/users/audit";
import { AzuraClient } from "./azuracast";

const KEY = "studio.azuracast";
const DEFAULTS = { baseUrl: "https://radio.stereoface.online", stationId: "stereo_face" };

const stored = z.object({ baseUrl: z.string(), stationId: z.string(), apiKey: z.string().default("") });

export const studioConfigSchema = z.object({
  baseUrl: publicHttpUrlSchema.refine((u) => u.startsWith("https://"), "Debe ser https"),
  stationId: z.string().trim().regex(/^[a-z0-9_-]{2,60}$/i, "Solo letras, números, guion y guion bajo"),
  apiKey: z.string().trim().max(200).optional(),
});
export type StudioConfigInput = z.input<typeof studioConfigSchema>;

/** Solo servidor: incluye la clave. Nunca devolver este objeto al navegador. */
export async function readStored(db: Db) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, KEY));
  const parsed = stored.safeParse(row?.value);
  return parsed.success ? parsed.data : { ...DEFAULTS, apiKey: "" };
}

/** Para la pantalla de ajustes: nunca incluye la clave. */
export async function getStudioConfig(db: Db, actor: Actor | null) {
  assertCan(actor, "station:manage");
  const s = await readStored(db);
  return { baseUrl: s.baseUrl, stationId: s.stationId, hasKey: s.apiKey.length > 0 };
}

/** La clave vacía conserva la guardada. En la auditoría no se anota la clave. */
export async function saveStudioConfig(db: Db, actor: Actor | null, raw: StudioConfigInput): Promise<void> {
  assertCan(actor, "station:manage");
  const input = studioConfigSchema.parse(raw);
  const current = await readStored(db);
  const apiKey = input.apiKey ? input.apiKey : current.apiKey;
  const value = { baseUrl: input.baseUrl.replace(/\/+$/, ""), stationId: input.stationId, apiKey };
  await db
    .insert(siteSettings)
    .values({ key: KEY, value, updatedBy: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id } });
  await recordAudit(db, {
    userId: actor.id,
    action: "studio.settings.update",
    entity: "settings",
    diff: { baseUrl: value.baseUrl, stationId: value.stationId, keyChanged: Boolean(input.apiKey) },
  });
}

/** Cliente listo para usar en rutas del servidor. Exige permiso de uso del estudio. */
export async function loadAzuraClient(db: Db, actor: Actor | null, fetchImpl?: typeof fetch): Promise<AzuraClient> {
  assertCan(actor, "station:update");
  const s = await readStored(db);
  if (!s.apiKey) throw new DomainError("studio_no_key", "Configura la clave de AzuraCast en los ajustes del estudio.");
  return new AzuraClient({ baseUrl: s.baseUrl, stationId: s.stationId, apiKey: s.apiKey }, fetchImpl);
}
