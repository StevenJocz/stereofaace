import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { djCredentialsHandler } from "@/modules/schedule/dj-http";

export async function GET() {
  await connection();
  return djCredentialsHandler(await getDb(), await getCurrentUser());
}
