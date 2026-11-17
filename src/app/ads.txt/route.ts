import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { adsTxtFor, getAdsConfig } from "@/modules/settings/ads";

/** Autoriza a Google a vender publicidad en el dominio. Sin publicidad activa responde 404. */
export async function GET() {
  await connection();
  try {
    const body = adsTxtFor(await getAdsConfig(await getDb()));
    if (!body) return new Response("Not found", { status: 404 });
    return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
  } catch (error) {
    console.error("[ads.txt]", error);
    return new Response("Not found", { status: 404 });
  }
}
