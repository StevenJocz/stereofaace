import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { catalogArtistsHandler } from "@/modules/spaces/http";

export async function GET(request: Request) {
  await connection();
  return catalogArtistsHandler(await getDb(), await getCurrentUser(), new URL(request.url).searchParams.get("q"));
}
