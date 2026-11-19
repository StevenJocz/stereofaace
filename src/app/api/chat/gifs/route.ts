import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { MEDIA_ROOT } from "@/modules/media/service";
import { userGifsHandler } from "@/modules/chat/http";

/** Mis GIF del chat: GET lista, POST sube (multipart «file»), DELETE ?id= borra. */
async function handle(request: Request) {
  await connection();
  return userGifsHandler(await getDb(), await getCurrentUser(), request, MEDIA_ROOT);
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
