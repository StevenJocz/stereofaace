import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { followsListHandler } from "@/modules/spaces/http";

const ipOf = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || r.headers.get("x-real-ip") || "local";

/** Lista de seguidores o seguidos: GET ?username=…&kind=followers|following&page=1 */
export async function GET(request: Request) {
  await connection();
  return followsListHandler(await getDb(), await getCurrentUser(), request, ipOf(request));
}
