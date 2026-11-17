import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { studioChatAction, studioChatFeed } from "@/modules/chat/http";

/** Sondeo del estudio: interruptores, mensajes nuevos y pedidos pendientes. */
export async function GET(request: Request) {
  await connection();
  return studioChatFeed(await getDb(), await getCurrentUser(), { after: new URL(request.url).searchParams.get("after") });
}

/** Moderación y ajustes del chat desde el estudio. */
export async function POST(request: Request) {
  await connection();
  const body: unknown = await request.json().catch(() => null);
  return studioChatAction(await getDb(), await getCurrentUser(), body);
}
