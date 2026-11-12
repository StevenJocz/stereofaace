import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/rbac";
import { isPublicHost } from "@/lib/validation";
import { siteSettings } from "@/modules/settings/schema";
import { recordAudit } from "@/modules/users/audit";
import { AzuraClient } from "./azuracast";
import { readStored } from "./settings";

const KEY = "studio.relay";
const DEFAULT_NAME = "Trance Is Star Radio";

const stored = z.object({ name: z.string().default(DEFAULT_NAME), url: z.string().default(""), autodj: z.boolean().default(false) });

export const relayInputSchema = z.object({
  name: z.string().trim().min(1, "Pon un nombre").max(60).default(DEFAULT_NAME),
  /** Vacía = quitar la señal. */
  url: z
    .string()
    .trim()
    .max(500)
    .superRefine((v, ctx) => {
      if (v === "") return;
      let u: URL;
      try {
        u = new URL(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Dirección no válida" });
        return;
      }
      if (u.protocol !== "http:" && u.protocol !== "https:") ctx.addIssue({ code: "custom", message: "Solo http o https" });
      else if (!isPublicHost(u.hostname)) ctx.addIssue({ code: "custom", message: "Destino no permitido" });
    })
    .default(""),
  autodj: z.boolean().default(false),
});
export type RelayInput = z.input<typeof relayInputSchema>;
export type AutodjSync = "skipped" | "no_key" | "synced" | "failed";

async function read(db: Db) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, KEY));
  const parsed = stored.safeParse(row?.value);
  return parsed.success ? parsed.data : { name: DEFAULT_NAME, url: "", autodj: false };
}

/** Para los ajustes (administración de la emisora): incluye la dirección. */
export async function getRelayConfig(db: Db, actor: Actor | null) {
  assertCan(actor, "station:manage");
  return read(db);
}

/** Para el estudio: nombre y si hay señal; la dirección nunca sale del servidor. */
export async function getRelayPublic(db: Db, actor: Actor | null): Promise<{ configured: boolean; name: string }> {
  assertCan(actor, "station:update");
  const c = await read(db);
  return { configured: c.url !== "", name: c.name };
}

/** Solo servidor: la dirección para el proxy. */
export async function loadRelayUrl(db: Db, actor: Actor | null): Promise<string | null> {
  assertCan(actor, "station:update");
  const c = await read(db);
  return c.url || null;
}

async function syncAutodj(db: Db, name: string, url: string, enabled: boolean, fetchImpl: typeof fetch): Promise<AutodjSync> {
  const cfg = await readStored(db);
  if (!cfg.apiKey) return enabled ? "no_key" : "skipped";
  try {
    const client = new AzuraClient(cfg, fetchImpl);
    const found = (await client.listPlaylistsRaw()).find((p) => p.source === "remote_url" && p.name.toLowerCase() === name.toLowerCase());
    const body = { name, source: "remote_url", remote_type: "stream", remote_url: url, is_enabled: enabled && url !== "", type: "default" };
    if (found) {
      await client.updatePlaylist(found.id, body);
      return "synced";
    }
    if (!enabled || !url) return "skipped";
    await client.createPlaylist({ ...body, order: "shuffle", weight: 3, remote_buffer: 0 });
    return "synced";
  } catch {
    return "failed";
  }
}

/** Guarda la señal externa y, si hay clave de AzuraCast, deja la lista «URL remota» del AutoDJ al día. */
export async function saveRelayConfig(db: Db, actor: Actor | null, raw: RelayInput, fetchImpl: typeof fetch = fetch): Promise<{ autodj: AutodjSync }> {
  assertCan(actor, "station:manage");
  const input = relayInputSchema.parse(raw);
  await db
    .insert(siteSettings)
    .values({ key: KEY, value: input, updatedBy: actor.id })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: input, updatedBy: actor.id } });
  await recordAudit(db, { userId: actor.id, action: "studio.relay.update", entity: "settings", diff: { name: input.name, url: input.url, autodj: input.autodj } });
  return { autodj: await syncAutodj(db, input.name, input.url, input.autodj, fetchImpl) };
}
