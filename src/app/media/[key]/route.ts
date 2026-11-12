import { getDb } from "@/lib/db";
import { MEDIA_ROOT, getPublicMedia } from "@/modules/media/service";
import { readStoredMedia } from "@/modules/media/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const media = await getPublicMedia(await getDb(), key);
  if (!media) return new Response(null, { status: 404 });
  const bytes = await readStoredMedia(MEDIA_ROOT, media.storageKey);
  if (!bytes) return new Response(null, { status: 404 });
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  return new Response(body, {
    headers: {
      "content-type": media.mime,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
