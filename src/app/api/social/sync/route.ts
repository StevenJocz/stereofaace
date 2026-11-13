import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { syncFacebook, verifyFacebookSyncToken } from "@/modules/social/facebook";

/** Para un monitor externo (p. ej. Uptime Kuma cada 5 min): publica en Facebook las notas programadas que ya salieron. */
export async function GET(request: Request) {
  await connection();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const db = await getDb();
  if (!(await verifyFacebookSyncToken(db, token))) return Response.json({ error: "No autorizado." }, { status: 401, headers: { "cache-control": "no-store" } });
  try {
    return Response.json(await syncFacebook(db), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[social/sync]", error);
    return Response.json({ error: "No se pudo sincronizar." }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
