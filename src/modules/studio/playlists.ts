import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError, can, assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { studioPlaylists, type SavedItem } from "./schema";

export type { SavedItem };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const itemSchema = z.object({
  azId: z.string(),
  title: z.string().max(200),
  artist: z.string().max(200).default(""),
  durationSec: z.number().nonnegative().max(86_400).nullable().default(null),
});

const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Escribe un nombre para la lista").max(80, "El nombre admite hasta 80 caracteres"),
  items: z.array(itemSchema).min(1, "La lista no puede estar vacía").max(500, "Una lista admite hasta 500 pistas"),
});
export type SaveListInput = z.input<typeof saveSchema>;

/** Solo el dueño de la lista o quien gestiona la emisora (`station:manage`) puede verla, cambiarla o borrarla. */
function assertOwner(actor: Actor, ownerId: string) {
  if (actor.id !== ownerId && !can(actor.role, "station:manage")) throw new ForbiddenError("station:manage");
}

async function load(db: Db, id: string) {
  if (!UUID.test(id)) throw new DomainError("playlist_not_found", "Esa lista ya no existe.");
  const [row] = await db.select().from(studioPlaylists).where(eq(studioPlaylists.id, id));
  if (!row) throw new DomainError("playlist_not_found", "Esa lista ya no existe.");
  return row;
}

export async function listSaved(db: Db, actor: Actor | null): Promise<{ id: string; name: string; count: number; mine: boolean }[]> {
  assertCan(actor, "station:update");
  const rows = await db.select().from(studioPlaylists).orderBy(desc(studioPlaylists.updatedAt));
  const manage = can(actor.role, "station:manage");
  return rows
    .filter((r) => manage || r.ownerId === actor.id)
    .map((r) => ({ id: r.id, name: r.name, count: r.items.length, mine: r.ownerId === actor.id }));
}

export async function getSaved(db: Db, actor: Actor | null, id: string): Promise<{ id: string; name: string; items: SavedItem[] }> {
  assertCan(actor, "station:update");
  const row = await load(db, id);
  assertOwner(actor, row.ownerId);
  return { id: row.id, name: row.name, items: row.items };
}

/** Guarda (o actualiza con `id`) una lista. Los ítems sin id de AzuraCast numérico se descartan y se cuentan en `skipped`. */
export async function saveList(db: Db, actor: Actor | null, raw: SaveListInput): Promise<{ id: string; skipped: number }> {
  assertCan(actor, "station:update");
  const input = saveSchema.parse(raw);
  const valid = input.items.filter((i) => /^\d{1,9}$/.test(i.azId));
  const skipped = input.items.length - valid.length;
  if (valid.length === 0) throw new DomainError("playlist_empty", "Ninguna pista de la cola viene de la biblioteca de AzuraCast: solo esas se pueden guardar.");
  if (input.id) {
    const row = await load(db, input.id);
    assertOwner(actor, row.ownerId);
    await db.update(studioPlaylists).set({ name: input.name, items: valid }).where(eq(studioPlaylists.id, row.id));
    await recordAudit(db, { userId: actor.id, action: "studio.playlist.update", entity: "studio_playlist", entityId: row.id, diff: { tracks: valid.length } });
    return { id: row.id, skipped };
  }
  const [row] = await db.insert(studioPlaylists).values({ ownerId: actor.id, name: input.name, items: valid }).returning({ id: studioPlaylists.id });
  await recordAudit(db, { userId: actor.id, action: "studio.playlist.create", entity: "studio_playlist", entityId: row.id, diff: { tracks: valid.length } });
  return { id: row.id, skipped };
}

export async function deleteSaved(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "station:update");
  const row = await load(db, id);
  assertOwner(actor, row.ownerId);
  await db.delete(studioPlaylists).where(eq(studioPlaylists.id, row.id));
  await recordAudit(db, { userId: actor.id, action: "studio.playlist.delete", entity: "studio_playlist", entityId: row.id });
}
