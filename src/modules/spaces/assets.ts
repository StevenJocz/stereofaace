import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { readStoredMedia, removeStoredMedia, storeBytesAtomically } from "@/modules/media/storage";
import { validateImageUpload } from "@/modules/media/validation";
import { ASSET_KINDS, spaceAssets, spaceProfiles, type AssetKind } from "./schema";

/** Límites por persona: contra el abuso de almacenamiento. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_GALLERY = 6;
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const SINGLE: AssetKind[] = ["avatar", "cover", "background"];

/** Sube una imagen propia (avatar, portada, fondo o galería). Valida el tipo por el CONTENIDO, el tamaño y las cuotas. */
export async function uploadAsset(
  db: Db,
  userId: string,
  root: string,
  kindRaw: unknown,
  file: File,
  alt?: string,
): Promise<{ id: string; kind: AssetKind; storageKey: string }> {
  if (typeof kindRaw !== "string" || !(ASSET_KINDS as readonly string[]).includes(kindRaw)) throw new DomainError("bad_kind", "Tipo de imagen no válido.");
  const kind = kindRaw as AssetKind;
  if (file.size > MAX_IMAGE_BYTES) throw new DomainError("image_too_big", "La imagen supera el máximo de 5 MB.");
  const check = await validateImageUpload(file);
  if (!check.ok) throw new DomainError("bad_image", check.message);

  const mine = await db.select({ id: spaceAssets.id, kind: spaceAssets.kind, bytes: spaceAssets.bytes, storageKey: spaceAssets.storageKey }).from(spaceAssets).where(eq(spaceAssets.userId, userId));
  const replaced = SINGLE.includes(kind) ? mine.filter((a) => a.kind === kind) : [];
  if (kind === "gallery" && mine.filter((a) => a.kind === "gallery").length >= MAX_GALLERY) throw new DomainError("gallery_full", `La galería admite hasta ${MAX_GALLERY} imágenes.`);
  const used = mine.filter((a) => !replaced.includes(a)).reduce((n, a) => n + a.bytes, 0);
  if (used + check.bytes.byteLength > MAX_TOTAL_BYTES) throw new DomainError("quota", "Llegaste al límite de almacenamiento de tu Space (30 MB). Borra alguna imagen.");

  const storageKey = randomUUID();
  await storeBytesAtomically(root, storageKey, check.bytes);
  const [row] = await db
    .insert(spaceAssets)
    .values({ userId, kind, storageKey, mime: check.mime, bytes: check.bytes.byteLength, alt: alt?.trim().slice(0, 140) || null, position: mine.length })
    .returning({ id: spaceAssets.id });

  // Avatar y portada se enlazan al perfil; la anterior se borra (archivo y fila).
  if (kind === "avatar") await db.update(spaceProfiles).set({ avatarAssetId: row.id }).where(eq(spaceProfiles.userId, userId));
  if (kind === "cover") await db.update(spaceProfiles).set({ coverAssetId: row.id }).where(eq(spaceProfiles.userId, userId));
  for (const old of replaced) await removeAsset(db, userId, root, old.id, { keepLink: true });
  return { id: row.id, kind, storageKey };
}

export async function removeAsset(db: Db, userId: string, root: string, id: string, opts: { keepLink?: boolean } = {}): Promise<void> {
  const [a] = await db.select().from(spaceAssets).where(and(eq(spaceAssets.id, id), eq(spaceAssets.userId, userId)));
  if (!a) throw new DomainError("not_found", "Esa imagen no existe.");
  if (!opts.keepLink) {
    await db.update(spaceProfiles).set({ avatarAssetId: null }).where(and(eq(spaceProfiles.userId, userId), eq(spaceProfiles.avatarAssetId, id)));
    await db.update(spaceProfiles).set({ coverAssetId: null }).where(and(eq(spaceProfiles.userId, userId), eq(spaceProfiles.coverAssetId, id)));
    // Si era el fondo del borrador o del publicado, el diseño vuelve al degradado de su plantilla.
    for (const col of ["draft_design", "published_design"] as const) {
      await db.execute(sql`update space_profiles set ${sql.raw(col)} = jsonb_set(jsonb_set(${sql.raw(col)}, '{background,kind}', '"gradient"'), '{background,assetId}', 'null') where user_id = ${userId} and ${sql.raw(col)} #>> '{background,assetId}' = ${id}`);
    }
  }
  await db.delete(spaceAssets).where(eq(spaceAssets.id, id));
  await removeStoredMedia(root, a.storageKey);
}

/**
 * Lee una imagen para servirla. Pública si el Space está publicado y no desactivado y la imagen no fue marcada (ni siquiera su dueño la ve marcada);
 * su dueño siempre ve la suya (para previsualizar borradores).
 */
export async function readSpaceAsset(db: Db, root: string, key: string, viewerId: string | null): Promise<{ bytes: Buffer; mime: string; isPublic: boolean } | null> {
  const [row] = await db
    .select({ a: spaceAssets, status: spaceProfiles.status })
    .from(spaceAssets)
    .innerJoin(spaceProfiles, eq(spaceProfiles.userId, spaceAssets.userId))
    .where(eq(spaceAssets.storageKey, key));
  if (!row) return null;
  if (row.a.status !== "ok") return null; // una imagen marcada por la administración no se sirve a nadie
  const owner = viewerId !== null && viewerId === row.a.userId;
  const visible = row.status === "published";
  if (!visible && !owner) return null;
  const bytes = await readStoredMedia(root, key);
  return bytes ? { bytes, mime: row.a.mime, isPublic: visible && !owner } : null;
}

export async function listAssets(db: Db, userId: string) {
  return db.select().from(spaceAssets).where(eq(spaceAssets.userId, userId)).orderBy(asc(spaceAssets.position));
}
