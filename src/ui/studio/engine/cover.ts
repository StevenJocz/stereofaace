/** Portada incrustada en la etiqueta ID3v2 de un MP3 (marco APIC). Lectura pura, sin DOM. */

const ASCII = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
const syncsafe = (b: Uint8Array, o: number) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** Devuelve la primera imagen de portada (JPEG, PNG, WebP, GIF) o null si no hay o los datos están incompletos. */
export function parseId3Cover(bytes: Uint8Array): { mime: string; data: Uint8Array } | null {
  if (bytes.length < 10 || ASCII(bytes, 0, 3) !== "ID3") return null;
  const version = bytes[3];
  if (version !== 3 && version !== 4) return null;
  const flags = bytes[5];
  const tagEnd = Math.min(bytes.length, 10 + syncsafe(bytes, 6));
  let pos = 10;
  if (flags & 0x40 && pos + 4 <= tagEnd) {
    // Cabecera extendida: v2.4 incluye su propio tamaño (syncsafe); v2.3 lo excluye (4 bytes más).
    pos += version === 4 ? syncsafe(bytes, pos) : be32(bytes, pos) + 4;
  }
  while (pos + 10 <= tagEnd) {
    const id = ASCII(bytes, pos, pos + 4);
    if (id.charCodeAt(0) === 0) break; // relleno
    const size = version === 4 ? syncsafe(bytes, pos + 4) : be32(bytes, pos + 4);
    const start = pos + 10;
    const end = start + size;
    if (size <= 0 || end > bytes.length) return null; // tamaño absurdo o datos truncados
    if (id === "APIC") return readApic(bytes.subarray(start, end));
    pos = end;
  }
  return null;
}

function readApic(body: Uint8Array): { mime: string; data: Uint8Array } | null {
  const encoding = body[0];
  let i = 1;
  while (i < body.length && body[i] !== 0) i++; // tipo MIME (latin1, terminado en 0)
  const mime = ASCII(body, 1, i).toLowerCase();
  i += 2; // terminador del MIME + tipo de imagen
  const wide = encoding === 1 || encoding === 2; // la descripción termina en 0 (o 0 0 en UTF-16)
  while (i < body.length) {
    if (wide ? body[i] === 0 && body[i + 1] === 0 : body[i] === 0) break;
    i += wide ? 2 : 1;
  }
  i += wide ? 2 : 1;
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/.test(mime) || i >= body.length) return null;
  return { mime: mime === "image/jpg" ? "image/jpeg" : mime, data: body.slice(i) };
}
