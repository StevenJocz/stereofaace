import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { youtubeConnectStartHandler } from "@/modules/video/http";

export async function GET() {
  await connection();
  return youtubeConnectStartHandler(await getDb(), await getCurrentUser());
}
