import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { youtubeConnectCallbackHandler } from "@/modules/video/http";

export async function GET(request: Request) {
  await connection();
  return youtubeConnectCallbackHandler(await getDb(), await getCurrentUser(), new URL(request.url));
}
