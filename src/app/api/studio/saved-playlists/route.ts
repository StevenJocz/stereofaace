import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { savedDeleteHandler, savedGetHandler, savedListHandler, savedSaveHandler } from "@/modules/studio/data-http";

export async function GET(request: Request) {
  await connection();
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const [db, user] = [await getDb(), await getCurrentUser()];
  return id ? savedGetHandler(db, user, id, { check: params.get("check") === "1" }) : savedListHandler(db, user);
}

export async function POST(request: Request) {
  await connection();
  const body: unknown = await request.json().catch(() => null);
  return savedSaveHandler(await getDb(), await getCurrentUser(), body);
}

export async function DELETE(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return savedDeleteHandler(await getDb(), await getCurrentUser(), id);
}
