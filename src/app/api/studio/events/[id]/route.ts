import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { eventsDeleteHandler, eventsUpdateHandler } from "@/modules/studio/data-http";
import { bodyGate } from "@/modules/studio/http";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await getCurrentUser();
  const blocked = bodyGate(user, request, 64 * 1024);
  if (blocked) return blocked;
  const body: unknown = await request.json().catch(() => null);
  const { id } = await params;
  return eventsUpdateHandler(await getDb(), user, id, body);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return eventsDeleteHandler(await getDb(), await getCurrentUser(), id);
}
