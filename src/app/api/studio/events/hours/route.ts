import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { eventsHoursHandler } from "@/modules/studio/data-http";
import { bodyGate } from "@/modules/studio/http";

/** Anuncios de la hora: crea, actualiza o quita los eventos «Hora · HH:MM» de una sola vez. */
export async function POST(request: Request) {
  await connection();
  const user = await getCurrentUser();
  const blocked = bodyGate(user, request, 64 * 1024);
  if (blocked) return blocked;
  const body: unknown = await request.json().catch(() => null);
  return eventsHoursHandler(await getDb(), user, body);
}
