import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { videoWhipHandler } from "@/modules/video/http";

export async function POST(request: Request) {
  await connection();
  return videoWhipHandler(await getDb(), await getCurrentUser(), request);
}
