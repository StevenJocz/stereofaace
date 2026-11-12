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

const stored = z.object({
  name: z.string().default(DEFAULT_NAME),
  url: z.string().default(""),
  autodj: z.boolean().default(false),
  /** Listas de música de AzuraCast que se pausaron al activar la señal en el AutoDJ (para devolverlas al apagarla). */
  paused: z.array(z.number()).default([]),
});

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
  return parsed.success ? parsed.data : { name: DEFAULT_NAME, url: "", autodj: false, paused: [] as number[] };
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

type SyncResult = { autodj: AutodjSync; paused: number[]; detail?: string };

/**
 * Deja el AutoDJ de AzuraCast como pide la configuración. Con la señal activa se pausan las listas de música normales
 * (para que suene solo la señal); al apagarla se vuelven a encender las que se pausaron. Los jingles no se tocan.
 */
async function syncAutodj(db: Db, name: string, url: string, enabled: boolean, previouslyPaused: number[], fetchImpl: typeof fetch): Promise<SyncResult> {
  const cfg = await readStored(db);
  if (!cfg.apiKey) return { autodj: enabled ? "no_key" : "skipped", paused: previouslyPaused };
  let paused = previouslyPaused;
  try {
    const client = new AzuraClient(cfg, fetchImpl);
    const lists = await client.listPlaylistsRaw();
    const found = lists.find((p) => p.source === "remote_url" && p.name.toLowerCase() === name.toLowerCase());
    const active = enabled && url !== "";
    const body = { name, source: "remote_url", remote_type: "stream", remote_url: url, is_enabled: active, type: "default" };
    let touched = false;
    let skip = false;
    if (found) {
      await client.updatePlaylist(found.id, { ...body, weight: 25 });
      touched = true;
      skip = found.remote_url !== url || found.is_enabled !== active;
    } else if (active) {
      await client.createPlaylist({ ...body, order: "shuffle", weight: 25, remote_buffer: 0 });
      touched = true;
      skip = true;
    }
    if (active) {
      // Una señal nueva reemplaza a la anterior: las otras listas «URL remota» encendidas se apagan (y no se restauran).
      const oldSignals = lists.filter((p) => p.id !== found?.id && p.source === "remote_url" && p.is_enabled === true);
      for (const p of oldSignals) await client.updatePlaylist(p.id, { is_enabled: false });
      if (oldSignals.length > 0) skip = true;
      const music = lists.filter((p) => p.id !== found?.id && p.source === "songs" && p.type === "default" && p.is_enabled === true);
      for (const p of music) await client.updatePlaylist(p.id, { is_enabled: false });
      paused = [...new Set([...previouslyPaused, ...music.map((p) => p.id)])];
    } else {
      for (const id of previouslyPaused) if (lists.some((p) => p.id === id)) await client.updatePlaylist(id, { is_enabled: true });
      paused = [];
    }
    if (skip) await client.skipCurrent().catch(() => undefined); // si no hay permiso para saltar, el cambio se oye al terminar la pista
    return { autodj: touched || previouslyPaused.length > 0 ? "synced" : "skipped", paused };
  } catch (error) {
    return { autodj: "failed", paused, detail: error instanceof Error ? error.message : "Error desconocido." };
  }
}

/** Guarda la señal externa y, si hay clave de AzuraCast, deja la lista «URL remota» del AutoDJ al día. */
export async function saveRelayConfig(db: Db, actor: Actor | null, raw: RelayInput, fetchImpl: typeof fetch = fetch): Promise<{ autodj: AutodjSync; detail?: string }> {
  assertCan(actor, "station:manage");
  const input = relayInputSchema.parse(raw);
  const before = await read(db);
  const persist = async (paused: number[]) => {
    const value = { ...input, paused };
    await db
      .insert(siteSettings)
      .values({ key: KEY, value, updatedBy: actor.id })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedBy: actor.id } });
  };
  await persist(before.paused);
  await recordAudit(db, { userId: actor.id, action: "studio.relay.update", entity: "settings", diff: { name: input.name, url: input.url, autodj: input.autodj } });
  const r = await syncAutodj(db, input.name, input.url, input.autodj, before.paused, fetchImpl);
  if (r.paused !== before.paused) await persist(r.paused);
  return { autodj: r.autodj, detail: r.detail };
}

export type AutodjStatus = {
  hasKey: boolean;
  lists: { name: string; kind: "música" | "señal" | "otra"; enabled: boolean }[];
  error: string | null;
};

/** Diagnóstico: cómo están hoy las listas del AutoDJ en AzuraCast (para ver por qué suena lo que suena). */
export async function getAutodjStatus(db: Db, actor: Actor | null, fetchImpl: typeof fetch = fetch): Promise<AutodjStatus> {
  assertCan(actor, "station:manage");
  const cfg = await readStored(db);
  if (!cfg.apiKey) return { hasKey: false, lists: [], error: null };
  try {
    const lists = await new AzuraClient(cfg, fetchImpl).listPlaylistsRaw();
    return {
      hasKey: true,
      error: null,
      lists: lists.map((p) => ({ name: p.name, kind: p.source === "remote_url" ? "señal" : p.source === "songs" ? "música" : "otra", enabled: p.is_enabled === true })),
    };
  } catch (error) {
    return { hasKey: true, lists: [], error: error instanceof Error ? error.message : "No se pudo consultar AzuraCast." };
  }
}
