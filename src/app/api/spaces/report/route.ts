import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { reportHandler } from "@/modules/spaces/http";

export async function POST(request: Request) {
  await connection();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return reportHandler(await getDb(), await getCurrentUser(), request, ip);
}
