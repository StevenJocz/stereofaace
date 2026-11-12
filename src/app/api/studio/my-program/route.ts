import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { djProgramHandler } from "@/modules/schedule/dj-http";

export async function GET(request: Request) {
  await connection();
  return djProgramHandler(await getDb(), await getCurrentUser(), new URL(request.url).searchParams.get("dj"));
}
