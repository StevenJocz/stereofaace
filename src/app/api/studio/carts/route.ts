import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { MEDIA_ROOT } from "@/modules/media/service";
import { cartUploadHandler, cartsListHandler } from "@/modules/studio/cart-http";

export async function GET() {
  await connection();
  return cartsListHandler(await getDb(), await getCurrentUser());
}

export async function POST(request: Request) {
  await connection();
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "Formulario no válido." }, { status: 400 });
  return cartUploadHandler(await getDb(), await getCurrentUser(), MEDIA_ROOT, form);
}
