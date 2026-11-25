import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { eventsCreateHandler, eventsListHandler } from "@/modules/studio/data-http";
import { bodyGate } from "@/modules/studio/http";

/** Eventos del programador del estudio (compartidos por toda la emisora). */
export async function GET() {
  await connection();
  return eventsListHandler(await getDb(), await getCurrentUser());
}

export async function POST(request: Request) {
  await connection();
  const user = await getCurrentUser();
  const blocked = bodyGate(user, request, 64 * 1024);
  if (blocked) return blocked;
  const body: unknown = await request.json().catch(() => null);
  return eventsCreateHandler(await getDb(), user, body);
}
