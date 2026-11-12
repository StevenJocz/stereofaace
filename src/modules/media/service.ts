import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { media } from "./schema";
import { removeStoredMedia, storeImageAtomically } from "./storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/data/media";

export type UploadMetadata = { alt: string; credit: string; license: string; root?: string };
export type StoredMedia = {
  id: string;
  storageKey: string;
  mime: string;
  bytes: number;
  alt: string;
  credit: string;
  license: string;
  url: string;
};

const clean = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) throw new Error(`${label} es obligatorio y debe tener máximo 200 caracteres.`);
  return trimmed;
};

export const asPublic = (row: typeof media.$inferSelect): StoredMedia => ({
  id: row.id,
  storageKey: row.storageKey,
  mime: row.mime,
  bytes: row.bytes,
  alt: row.alt ?? "",
  credit: row.credit ?? "",
  license: row.license ?? "",
  url: `${SITE_URL}/media/${row.storageKey}`,
});

export async function createUploadedMedia(db: Db, actor: Actor | null, file: File, metadata: UploadMetadata): Promise<StoredMedia> {
  assertCan(actor, "media:create");
  const alt = clean(metadata.alt, "El texto alternativo");
  const credit = clean(metadata.credit, "El crédito");
  const license = clean(metadata.license, "La licencia o permiso");
  const root = metadata.root ?? MEDIA_ROOT;
  const stored = await storeImageAtomically(root, file);
  try {
    const [row] = await db
      .insert(media)
      .values({
        storageKey: stored.storageKey,
        mime: stored.mime,
        bytes: stored.bytes,
        alt,
        credit,
        license,
        uploadedBy: actor.id,
      })
      .returning();
    await recordAudit(db, { userId: actor.id, action: "media.create", entity: "media", entityId: row.id });
    return asPublic(row);
  } catch (error) {
    await removeStoredMedia(root, stored.storageKey).catch(() => undefined);
    throw error;
  }
}

export async function getPublicMedia(db: Db, storageKey: string): Promise<StoredMedia | null> {
  if (!UUID.test(storageKey)) return null;
  const [row] = await db.select().from(media).where(eq(media.storageKey, storageKey)).limit(1);
  return row ? asPublic(row) : null;
}
