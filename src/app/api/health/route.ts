import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Salud del servicio (Docker healthcheck, Nginx, monitor externo).
 * 200 = proceso vivo y base de datos respondiendo; 503 = base de datos caída o lenta.
 * No expone versiones, rutas ni mensajes de error.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ]);
    return Response.json({ status: "ok", db: "ok", ms: Date.now() - started }, { headers: NO_STORE });
  } catch (error) {
    console.error("[health] la base de datos no responde:", error instanceof Error ? error.message : error);
    return Response.json({ status: "degraded", db: "down" }, { status: 503, headers: NO_STORE });
  }
}
