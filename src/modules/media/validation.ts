const MAX_BYTES = 10 * 1024 * 1024;

const accepted = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type ImageMime = keyof typeof accepted;
export type ImageValidation =
  | { ok: true; mime: ImageMime; extension: (typeof accepted)[ImageMime]; bytes: Uint8Array }
  | { ok: false; message: string };

function detectedMime(bytes: Uint8Array): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
    ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))
  )
    return "image/avif";
  return null;
}

export async function validateImageUpload(file: File): Promise<ImageValidation> {
  if (file.size > MAX_BYTES) return { ok: false, message: "La imagen supera el límite de 10 MiB." };
  if (!(file.type in accepted)) return { ok: false, message: "Formato no permitido. Usa JPG, PNG, WebP o AVIF." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = detectedMime(bytes);
  if (!mime || mime !== file.type) return { ok: false, message: "El MIME declarado no coincide con el contenido de la imagen." };
  return { ok: true, mime, extension: accepted[mime], bytes };
}

export { MAX_BYTES };
