import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { batchHandler } from "@/modules/studio/library-http";

export async function POST(request: Request) {
  await connection();
  return batchHandler(await getDb(), await getCurrentUser(), request);
}
