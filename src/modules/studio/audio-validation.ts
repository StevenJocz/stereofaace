export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type AudioValidation =
  | { ok: true; mime: string; extension: string; bytes: Uint8Array }
  | { ok: false; message: string };

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** Detecta el formato por su contenido (firma), nunca por el nombre o el tipo que declare el navegador. */
function sniff(b: Uint8Array): { mime: string; extension: string } | null {
  if (b.length < 4) return null;
  if (ascii(b, 0, 3) === "ID3") return { mime: "audio/mpeg", extension: "mp3" };
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return { mime: "audio/mpeg", extension: "mp3" };
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE") return { mime: "audio/wav", extension: "wav" };
  if (ascii(b, 0, 4) === "OggS") return { mime: "audio/ogg", extension: "ogg" };
  if (ascii(b, 0, 4) === "fLaC") return { mime: "audio/flac", extension: "flac" };
  if (b.length >= 12 && ascii(b, 4, 8) === "ftyp") return { mime: "audio/mp4", extension: "m4a" };
  return null;
}

export async function validateAudioUpload(file: File): Promise<AudioValidation> {
  if (file.size === 0) return { ok: false, message: "El archivo está vacío." };
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, message: "El audio supera el máximo de 25 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return { ok: false, message: "El archivo no es un audio válido (MP3, WAV, OGG, M4A o FLAC)." };
  return { ok: true, mime: kind.mime, extension: kind.extension, bytes };
}
