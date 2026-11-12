import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { scheduleHandler } from "@/modules/schedule/http";

/** Parrilla pública por rango de fechas locales de Bogotá: ?from=AAAA-MM-DD&to=AAAA-MM-DD (máx. 62 días). */
export async function GET(request: Request) {
  await connection();
  const q = new URL(request.url).searchParams;
  try {
    return await scheduleHandler(await getDb(), q.get("from"), q.get("to"));
  } catch (error) {
    console.error("[radio/schedule]", error);
    return Response.json({ error: "No se pudo cargar la programación." }, { status: 500 });
  }
}
