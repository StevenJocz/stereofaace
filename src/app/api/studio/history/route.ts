import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { bodyGate } from "@/modules/studio/http";
import { historyCsvHandler, historyListHandler, historyLogHandler } from "@/modules/studio/data-http";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const [db, user] = [await getDb(), await getCurrentUser()];
  if (url.searchParams.get("format") === "csv") return historyCsvHandler(db, user);
  return historyListHandler(db, user, { limit: url.searchParams.get("limit"), before: url.searchParams.get("before") });
}

export async function POST(request: Request) {
  await connection();
  const user = await getCurrentUser();
  const blocked = bodyGate(user, request, 512 * 1024);
  if (blocked) return blocked;
  const body: unknown = await request.json().catch(() => null);
  return historyLogHandler(await getDb(), user, body);
}
