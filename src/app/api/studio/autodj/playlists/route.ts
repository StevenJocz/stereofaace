import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { autodjDeleteHandler, autodjListHandler, autodjSaveHandler } from "@/modules/studio/library-http";

export async function GET() {
  await connection();
  return autodjListHandler(await getDb(), await getCurrentUser());
}

export async function POST(request: Request) {
  await connection();
  return autodjSaveHandler(await getDb(), await getCurrentUser(), request);
}

export async function DELETE(request: Request) {
  await connection();
  return autodjDeleteHandler(await getDb(), await getCurrentUser(), request);
}
