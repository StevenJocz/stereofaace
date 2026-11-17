import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { videoStopHandler } from "@/modules/video/http";

export async function POST(request: Request) {
  await connection();
  return videoStopHandler(await getDb(), await getCurrentUser(), request);
}
