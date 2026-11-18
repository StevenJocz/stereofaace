import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { publicChatGet, publicChatPost } from "@/modules/chat/http";

const ipOf = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || r.headers.get("x-real-ip") || "local";

/** Chat público de la radio: mensajes nuevos desde un cursor. */
export async function GET(request: Request) {
  await connection();
  const p = new URL(request.url).searchParams;
  return publicChatGet(await getDb(), { after: p.get("after"), user: await getCurrentUser() });
}

export async function POST(request: Request) {
  await connection();
  const body: unknown = await request.json().catch(() => null);
  return publicChatPost(await getDb(), body, ipOf(request), await getCurrentUser());
}
