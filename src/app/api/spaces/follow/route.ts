import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { followHandler } from "@/modules/spaces/http";

export async function POST(request: Request) {
  await connection();
  return followHandler(await getDb(), await getCurrentUser(), request);
}

export async function DELETE(request: Request) {
  await connection();
  return followHandler(await getDb(), await getCurrentUser(), request);
}
