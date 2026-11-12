import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { playlistsHandler } from "@/modules/studio/http";

export async function GET(request: Request) {
  await connection();
  return playlistsHandler(await getDb(), await getCurrentUser(), new URL(request.url).searchParams.get("id"));
}
