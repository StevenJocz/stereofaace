import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { relayStreamHandler } from "@/modules/studio/relay-http";

/** Audio de la señal externa (Trance Is Star Radio) para el mezclador del estudio. */
export async function GET(request: Request) {
  await connection();
  return relayStreamHandler(await getDb(), await getCurrentUser(), request);
}
