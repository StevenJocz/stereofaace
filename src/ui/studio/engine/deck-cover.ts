import { parseId3Cover } from "./cover";
import type { QueueItem } from "./queue";

export type DeckCover = { url: string; revoke: () => void };

const ID3_BYTES = 768 * 1024; // las portadas incrustadas viven al inicio del archivo

/** Carátula de una pista: la de AzuraCast por el proxy del estudio, o la incrustada (ID3) de un MP3 local. */
export async function loadCover(item: QueueItem): Promise<DeckCover | null> {
  if (item.url) {
    const m = item.url.match(/^\/api\/studio\/file\/(\d+)$/);
    return m ? { url: `/api/studio/art/${m[1]}`, revoke: () => undefined } : null;
  }
  if (!item.file) return null;
  try {
    const head = new Uint8Array(await item.file.slice(0, ID3_BYTES).arrayBuffer());
    const cover = parseId3Cover(head);
    if (!cover) return null;
    const url = URL.createObjectURL(new Blob([cover.data.slice().buffer], { type: cover.mime }));
    return { url, revoke: () => URL.revokeObjectURL(url) };
  } catch {
    return null;
  }
}
