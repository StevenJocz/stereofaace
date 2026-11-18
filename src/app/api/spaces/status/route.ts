import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { statusHandler } from "@/modules/spaces/http";

export async function GET() {
  await connection();
  return statusHandler(await getDb(), await getCurrentUser());
}
