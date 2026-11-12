import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { readStoredMedia, removeStoredMedia, storeBytesAtomically } from "@/modules/media/storage";
import { recordAudit } from "@/modules/users/audit";
import { validateAudioUpload } from "./audio-validation";
import { CART_KINDS, studioCarts, type CartKind } from "./schema";

export { CART_KINDS };
export type { CartKind };

export type CartView = {
  id: string;
  name: string;
  kind: CartKind;
  color: string;
  hotkey: string | null;
  durationSec: number | null;
  gainDb: number;
  duck: boolean;
  position: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const fields = {
  name: z.string().trim().min(1, "Escribe un nombre").max(60),
  kind: z.enum(CART_KINDS),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color no válido (usa #rrggbb)"),
  hotkey: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]$/, "El atajo es una sola letra o número")
    .refine((k) => k.toLowerCase() !== "v", "La tecla V está reservada para hablar por el micrófono"),
  gainDb: z.number().min(-24).max(6),
  duck: z.boolean(),
  durationSec: z.number().positive().max(3600),
};

const createSchema = z.object({
  name: fields.name,
  kind: fields.kind,
  color: fields.color.optional(),
  hotkey: fields.hotkey.optional(),
  gainDb: fields.gainDb.optional(),
  duck: fields.duck.optional(),
  durationSec: fields.durationSec.optional(),
});
const patchSchema = z.object({
  name: fields.name.optional(),
  kind: fields.kind.optional(),
  color: fields.color.optional(),
  hotkey: fields.hotkey.nullable().optional(),
  gainDb: fields.gainDb.optional(),
  duck: fields.duck.optional(),
});
export type CartInput = z.input<typeof createSchema>;
export type CartPatch = z.input<typeof patchSchema>;

type Row = typeof studioCarts.$inferSelect;
const view = (r: Row): CartView => ({
  id: r.id,
  name: r.name,
  kind: r.kind as CartKind,
  color: r.color,
  hotkey: r.hotkey,
  durationSec: r.durationSec,
  gainDb: r.gainDb,
  duck: r.duck,
  position: r.position,
});

const active = isNull(studioCarts.deletedAt);

export async function listCarts(db: Db, actor: Actor | null): Promise<CartView[]> {
  assertCan(actor, "station:update");
  const rows = await db.select().from(studioCarts).where(active).orderBy(asc(studioCarts.position), asc(studioCarts.createdAt));
  return rows.map(view);
}

async function assertHotkeyFree(db: Db, hotkey: string | null | undefined, exceptId?: string) {
  if (!hotkey) return;
  const rows = await db
    .select({ id: studioCarts.id })
    .from(studioCarts)
    .where(and(active, sql`lower(${studioCarts.hotkey}) = ${hotkey.toLowerCase()}`));
  if (rows.some((r) => r.id !== exceptId)) {
    throw new DomainError("cart_hotkey_taken", `El atajo «${hotkey}» ya lo usa otro cart.`);
  }
}

export async function createCart(db: Db, actor: Actor | null, root: string, raw: CartInput, file: File): Promise<CartView> {
  assertCan(actor, "station:update");
  const input = createSchema.parse(raw);
  await assertHotkeyFree(db, input.hotkey);
  const audio = await validateAudioUpload(file);
  if (!audio.ok) throw new DomainError("cart_bad_audio", audio.message);
  const storageKey = randomUUID();
  await storeBytesAtomically(root, storageKey, audio.bytes);
  try {
    const [last] = await db.select({ p: studioCarts.position }).from(studioCarts).where(active).orderBy(desc(studioCarts.position)).limit(1);
    const [row] = await db
      .insert(studioCarts)
      .values({
        name: input.name,
        kind: input.kind,
        color: input.color ?? "#c6ff00",
        hotkey: input.hotkey?.toLowerCase() ?? null,
        storageKey,
        mime: audio.mime,
        bytes: audio.bytes.byteLength,
        durationSec: input.durationSec ?? null,
        gainDb: input.gainDb ?? 0,
        duck: input.duck ?? true,
        position: (last?.p ?? -1) + 1,
        createdBy: actor.id,
      })
      .returning();
    await recordAudit(db, { userId: actor.id, action: "studio.cart.create", entity: "studio_cart", entityId: row.id, diff: { name: row.name, kind: row.kind } });
    return view(row);
  } catch (error) {
    await removeStoredMedia(root, storageKey).catch(() => undefined);
    throw error;
  }
}

export async function updateCart(db: Db, actor: Actor | null, id: string, raw: CartPatch): Promise<CartView> {
  assertCan(actor, "station:update");
  const patch = patchSchema.parse(raw);
  if (patch.hotkey) await assertHotkeyFree(db, patch.hotkey, id);
  const set: Partial<typeof studioCarts.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.kind !== undefined) set.kind = patch.kind;
  if (patch.color !== undefined) set.color = patch.color;
  if (patch.hotkey !== undefined) set.hotkey = patch.hotkey ? patch.hotkey.toLowerCase() : null;
  if (patch.gainDb !== undefined) set.gainDb = patch.gainDb;
  if (patch.duck !== undefined) set.duck = patch.duck;
  const [row] = await db.update(studioCarts).set(set).where(and(eq(studioCarts.id, id), active)).returning();
  if (!row) throw new DomainError("cart_not_found", "Ese cart ya no existe.");
  await recordAudit(db, { userId: actor.id, action: "studio.cart.update", entity: "studio_cart", entityId: id, diff: { fields: Object.keys(set) } });
  return view(row);
}

/** Borrado lógico: el cart desaparece del Cart Wall y su audio deja de servirse. */
export async function deleteCart(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "station:delete");
  const [row] = await db.update(studioCarts).set({ deletedAt: new Date() }).where(and(eq(studioCarts.id, id), active)).returning({ id: studioCarts.id });
  if (!row) throw new DomainError("cart_not_found", "Ese cart ya no existe.");
  await recordAudit(db, { userId: actor.id, action: "studio.cart.delete", entity: "studio_cart", entityId: id });
}

export async function moveCart(db: Db, actor: Actor | null, id: string, direction: "up" | "down"): Promise<void> {
  assertCan(actor, "station:update");
  const rows = await db.select().from(studioCarts).where(active).orderBy(asc(studioCarts.position), asc(studioCarts.createdAt));
  const i = rows.findIndex((r) => r.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  const [a, b] = [rows[i], rows[j]];
  // Se renumera la lista completa para evitar posiciones repetidas.
  const order = rows.map((r) => r.id);
  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(order.map((rid, pos) => db.update(studioCarts).set({ position: pos }).where(eq(studioCarts.id, rid))));
  await recordAudit(db, { userId: actor.id, action: "studio.cart.move", entity: "studio_cart", entityId: a.id, diff: { with: b.id, direction } });
}

export async function readCartAudio(db: Db, actor: Actor | null, root: string, id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  assertCan(actor, "station:update");
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(studioCarts).where(and(eq(studioCarts.id, id), active));
  if (!row) return null;
  const bytes = await readStoredMedia(root, row.storageKey);
  return bytes ? { bytes, mime: row.mime } : null;
}
