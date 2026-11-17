import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { videoStatusHandler } from "@/modules/video/http";

export async function GET() {
  await connection();
  return videoStatusHandler(await getDb(), await getCurrentUser());
}
