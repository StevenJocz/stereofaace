import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { meGetHandler } from "@/modules/spaces/http";

export async function GET() {
  await connection();
  return meGetHandler(await getDb(), await getCurrentUser());
}
