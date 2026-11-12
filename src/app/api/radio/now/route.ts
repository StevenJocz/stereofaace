import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { nowHandler } from "@/modules/schedule/http";

/** Programa que suena ahora en StereoFace Radio (público, caché corta). */
export async function GET() {
  await connection();
  try {
    return await nowHandler(await getDb());
  } catch (error) {
    console.error("[radio/now]", error);
    return Response.json({ now: null }, { status: 200, headers: { "cache-control": "public, max-age=0, s-maxage=10" } });
  }
}
