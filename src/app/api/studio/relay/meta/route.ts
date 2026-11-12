import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { guarded } from "@/modules/studio/http";
import { getRelayNowPlaying } from "@/modules/studio/relay-meta";

/** Canción que suena en la señal externa (si su servicio publica el dato). */
export async function GET() {
  await connection();
  const [db, user] = [await getDb(), await getCurrentUser()];
  return guarded(user, async () => Response.json({ track: await getRelayNowPlaying(db, user) }, { headers: { "cache-control": "private, max-age=0, s-maxage=0" } }));
}
