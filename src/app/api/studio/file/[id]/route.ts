import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { fileHandler } from "@/modules/studio/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return fileHandler(await getDb(), await getCurrentUser(), id, request.headers.get("range"));
}
