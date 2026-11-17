import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { publicRequestPost, publicRequestsGet } from "@/modules/chat/http";

const ipOf = (r: Request) => r.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || r.headers.get("x-real-ip") || "local";

/** Pedidos de canciones de la audiencia. */
export async function GET(request: Request) {
  await connection();
  return publicRequestsGet(await getDb(), { clientId: new URL(request.url).searchParams.get("clientId") });
}

export async function POST(request: Request) {
  await connection();
  const body: unknown = await request.json().catch(() => null);
  return publicRequestPost(await getDb(), body, ipOf(request));
}
