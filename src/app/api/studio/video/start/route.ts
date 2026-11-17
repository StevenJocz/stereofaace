import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { videoStartHandler } from "@/modules/video/http";

export async function POST(request: Request) {
  await connection();
  return videoStartHandler(await getDb(), await getCurrentUser(), request);
}
