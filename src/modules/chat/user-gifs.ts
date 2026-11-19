import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { storeBytesAtomically } from "@/modules/media/storage";
import { assertCan, type Actor } from "@/lib/rbac";
import { MAX_TOTAL_BYTES, removeAsset } from "@/modules/spaces/assets";
import { recordAudit } from "@/modules/users/audit";
import { spaceAssets, spaceProfiles } from "@/modules/spaces/schema";

/** GIF propios del chat: por persona y por archivo, para cuidar el almacenamiento y el chat. */
export const MAX_GIF_BYTES = 2 * 1024 * 1024;
export const MAX_USER_GIFS = 12;
export const MAX_GIF_SIDE = 600;

export type ChatGifCheck = { ok: true; width: number; height: number } | { ok: false; message: string };

/** Valida un GIF por su CONTENIDO (cabecera GIF87a/GIF89a, medidas y terminador), no por el nombre ni el tipo declarado. */
export function validateGifBytes(bytes: Uint8Array): ChatGifCheck {
  if (bytes.byteLength > MAX_GIF_BYTES) return { ok: false, message: "El GIF supera el máximo de 2 MB." };
  const sig = String.fromCharCode(...bytes.slice(0, 6));
  if (bytes.byteLength < 14 || (sig !== "GIF87a" && sig !== "GIF89a")) return { ok: false, message: "Ese archivo no es un GIF." };
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width < 1 || height < 1) return { ok: false, message: "El GIF no es válido." };
  if (width > MAX_GIF_SIDE || height > MAX_GIF_SIDE) return { ok: false, message: `El GIF es muy grande: máximo ${MAX_GIF_SIDE}×${MAX_GIF_SIDE} px.` };
  if (bytes[bytes.byteLength - 1] !== 0x3b) return { ok: false, message: "El GIF está incompleto o dañado." };
  return { ok: true, width, height };
}

export type UserGif = { id: string; key: string; url: string };
const toGif = (r: { id: string; storageKey: string }): UserGif => ({ id: r.id, key: `u:${r.storageKey}`, url: `/s/${r.storageKey}` });

export async function listUserGifs(db: Db, userId: string): Promise<UserGif[]> {
  const rows = await db
    .select({ id: spaceAssets.id, storageKey: spaceAssets.storageKey })
    .from(spaceAssets)
    .where(and(eq(spaceAssets.userId, userId), eq(spaceAssets.kind, "chatgif"), eq(spaceAssets.status, "ok")))
    .orderBy(asc(spaceAssets.createdAt));
  return rows.map(toGif);
}

/** Sube un GIF propio. Hace falta tener Space (ahí viven las imágenes de la persona) y que no esté desactivado. */
export async function uploadUserGif(db: Db, userId: string, root: string, file: File): Promise<UserGif> {
  if (file.size > MAX_GIF_BYTES) throw new DomainError("image_too_big", "El GIF supera el máximo de 2 MB.");
  const [p] = await db.select({ status: spaceProfiles.status }).from(spaceProfiles).where(eq(spaceProfiles.userId, userId));
  if (!p) throw new DomainError("no_profile", "Crea tu Space para poder subir tus propios GIF.");
  if (p.status === "disabled") throw new DomainError("space_disabled", "Tu Space está desactivado: no puedes subir GIF.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = validateGifBytes(bytes);
  if (!check.ok) throw new DomainError("bad_image", check.message);

  const mine = await db.select({ kind: spaceAssets.kind, bytes: spaceAssets.bytes }).from(spaceAssets).where(eq(spaceAssets.userId, userId));
  if (mine.filter((a) => a.kind === "chatgif").length >= MAX_USER_GIFS) throw new DomainError("gallery_full", `Puedes guardar hasta ${MAX_USER_GIFS} GIF. Borra alguno para subir otro.`);
  if (mine.reduce((n, a) => n + a.bytes, 0) + bytes.byteLength > MAX_TOTAL_BYTES) throw new DomainError("quota", "Llegaste al límite de almacenamiento de tu Space (30 MB). Borra alguna imagen.");

  const storageKey = randomUUID();
  await storeBytesAtomically(root, storageKey, bytes);
  const [row] = await db
    .insert(spaceAssets)
    .values({ userId, kind: "chatgif", storageKey, mime: "image/gif", bytes: bytes.byteLength, position: mine.length })
    .returning({ id: spaceAssets.id });
  return toGif({ id: row.id, storageKey });
}

export async function removeUserGif(db: Db, userId: string, root: string, id: string): Promise<void> {
  const [a] = await db.select({ kind: spaceAssets.kind }).from(spaceAssets).where(and(eq(spaceAssets.id, id), eq(spaceAssets.userId, userId)));
  if (!a || a.kind !== "chatgif") throw new DomainError("not_found", "Ese GIF no existe.");
  await removeAsset(db, userId, root, id);
}

/** GIF de la comunidad: los que subieron las demás personas. Cualquiera con cuenta puede usarlos en el chat. */
export const MAX_SHARED_GIFS = 60;
export async function listSharedGifs(db: Db, viewerId: string): Promise<UserGif[]> {
  const rows = await db
    .select({ id: spaceAssets.id, storageKey: spaceAssets.storageKey })
    .from(spaceAssets)
    .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceAssets.userId))
    .where(and(eq(spaceAssets.kind, "chatgif"), eq(spaceAssets.status, "ok"), ne(spaceProfiles.status, "disabled"), ne(spaceAssets.userId, viewerId)))
    .orderBy(desc(spaceAssets.createdAt))
    .limit(MAX_SHARED_GIFS);
  return rows.map(toGif);
}

/** ¿Esta clave «u:<uuid>» es un GIF de la comunidad vigente (no marcado y de un Space no desactivado)? Cualquiera con cuenta puede enviarlo. */
export async function gifUsable(db: Db, key: string): Promise<boolean> {
  const m = /^u:([0-9a-f-]{36})$/i.exec(key);
  if (!m) return false;
  const [r] = await db
    .select({ id: spaceAssets.id })
    .from(spaceAssets)
    .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceAssets.userId))
    .where(and(eq(spaceAssets.storageKey, m[1]), eq(spaceAssets.kind, "chatgif"), eq(spaceAssets.status, "ok"), ne(spaceProfiles.status, "disabled")));
  return Boolean(r);
}

/** Moderación (locutores y superiores): quita un GIF de la comunidad. Deja de servirse y de poder enviarse. */
export async function flagUserGif(db: Db, actor: Actor | null, key: string): Promise<void> {
  assertCan(actor, "studio:update");
  const m = /^u:([0-9a-f-]{36})$/i.exec(key);
  if (!m) throw new DomainError("not_found", "Ese GIF no existe.");
  const [r] = await db.update(spaceAssets).set({ status: "flagged" }).where(and(eq(spaceAssets.storageKey, m[1]), eq(spaceAssets.kind, "chatgif"))).returning({ id: spaceAssets.id });
  if (!r) throw new DomainError("not_found", "Ese GIF no existe.");
  await recordAudit(db, { userId: actor.id, action: "chat.gif.remove", entity: "space_asset", entityId: r.id });
}
