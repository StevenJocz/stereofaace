import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { libraryHandler } from "@/modules/studio/http";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  return libraryHandler(await getDb(), await getCurrentUser(), {
    path: url.searchParams.get("path"),
    q: url.searchParams.get("q"),
  });
}
