import type { QueueItem } from "./queue";

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac)$/i;

/** ¿Es un archivo de audio que el estudio puede reproducir? (por MIME o extensión) */
export function isAudioFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

/** «Artista - Título.ext» → artista y título; sin « - » el artista queda vacío. */
export function parseTrackName(fileName: string): { artist: string; title: string } {
  const base = fileName.replace(/\.[^./\\]+$/, "").trim();
  const sep = base.indexOf(" - ");
  if (sep === -1) return { artist: "", title: base };
  return { artist: base.slice(0, sep).trim(), title: base.slice(sep + 3).trim() };
}

/** Convierte archivos soltados en elementos de cola; lo que no es audio se informa por nombre. */
export function makeItems(files: File[]): { items: QueueItem[]; rejected: string[] } {
  const items: QueueItem[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    if (!isAudioFile(file)) {
      rejected.push(file.name);
      continue;
    }
    const { artist, title } = parseTrackName(file.name);
    items.push({ id: crypto.randomUUID(), file, url: null, title, artist, durationSec: null, source: "local" });
  }
  return { items, rejected };
}
