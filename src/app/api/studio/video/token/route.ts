import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { videoTokenHandler } from "@/modules/video/http";

export async function POST(request: Request) {
  await connection();
  return videoTokenHandler(await getDb(), await getCurrentUser(), request);
}
