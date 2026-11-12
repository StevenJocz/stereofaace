import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { MEDIA_ROOT } from "@/modules/media/service";
import { MAX_AUDIO_BYTES } from "@/modules/studio/audio-validation";
import { cartUploadHandler, cartsListHandler } from "@/modules/studio/cart-http";
import { bodyGate } from "@/modules/studio/http";

export async function GET() {
  await connection();
  return cartsListHandler(await getDb(), await getCurrentUser());
}

export async function POST(request: Request) {
  await connection();
  const user = await getCurrentUser();
  const blocked = bodyGate(user, request, MAX_AUDIO_BYTES + 64 * 1024); // audio + campos del formulario
  if (blocked) return blocked;
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Formulario no válido." }, { status: 400 });
  return cartUploadHandler(await getDb(), user, MEDIA_ROOT, form);
}
