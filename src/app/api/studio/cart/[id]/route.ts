import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { MEDIA_ROOT } from "@/modules/media/service";
import { cartAudioHandler } from "@/modules/studio/cart-http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return cartAudioHandler(await getDb(), await getCurrentUser(), MEDIA_ROOT, id, request.headers.get("range"));
}
