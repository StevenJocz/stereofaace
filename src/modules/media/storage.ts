import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateImageUpload, type ImageMime } from "./validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StoredImage = { storageKey: string; path: string; mime: ImageMime; bytes: number };

const safePath = (root: string, key: string) => (UUID.test(key) ? path.join(root, key) : null);

export async function storeImageAtomically(root: string, file: File, opts: { key?: string } = {}): Promise<StoredImage> {
  const valid = await validateImageUpload(file);
  if (!valid.ok) throw new Error(valid.message);
  const storageKey = opts.key ?? randomUUID();
  const target = safePath(root, storageKey);
  if (!target) throw new Error("Clave de almacenamiento inválida.");
  await mkdir(root, { recursive: true, mode: 0o750 });
  const temporary = path.join(root, `.${storageKey}.${randomUUID()}.upload`);
  try {
    await writeFile(temporary, valid.bytes, { mode: 0o640, flag: "wx" });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  return { storageKey, path: target, mime: valid.mime, bytes: valid.bytes.byteLength };
}

export async function readStoredMedia(root: string, storageKey: string): Promise<Buffer | null> {
  const target = safePath(root, storageKey);
  if (!target) return null;
  try {
    return await readFile(target);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function removeStoredMedia(root: string, storageKey: string): Promise<void> {
  const target = safePath(root, storageKey);
  if (!target) return;
  await rm(target, { force: true });
}
