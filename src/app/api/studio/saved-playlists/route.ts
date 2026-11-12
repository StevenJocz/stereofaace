import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { bodyGate } from "@/modules/studio/http";
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
  const user = await getCurrentUser();
  const blocked = bodyGate(user, request, 512 * 1024);
  if (blocked) return blocked;
  const body: unknown = await request.json().catch(() => null);
  return savedSaveHandler(await getDb(), user, body);
}

export async function DELETE(request: Request) {
  await connection();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  return savedDeleteHandler(await getDb(), await getCurrentUser(), id);
}
