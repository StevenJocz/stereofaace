import type { AzFile } from "@/modules/studio/azuracast";
import type { QueueItem } from "./queue";

export const DRAG_TYPE = "application/x-sf-items";

/** Pista de la biblioteca de AzuraCast → elemento de cola que se reproduce por el proxy del estudio. */
export function azToQueueItem(f: AzFile): QueueItem {
  return {
    id: crypto.randomUUID(),
    file: null,
    url: `/api/studio/file/${f.id}`,
    title: f.title,
    artist: f.artist,
    durationSec: f.durationSec,
    source: "azuracast",
  };
}

/** Lee lo que la biblioteca puso en `dataTransfer`; descarta todo lo que no sea una pista válida. */
export function parseDragItems(raw: string): AzFile[] {
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (x): x is AzFile =>
        typeof x === "object" && x !== null && typeof (x as AzFile).id === "string" && /^\d+$/.test((x as AzFile).id),
    );
  } catch {
    return [];
  }
}
