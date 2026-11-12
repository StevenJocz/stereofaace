import { getDb } from "@/lib/db";
import { listPublicStations } from "@/modules/radio/service";

/**
 * Emisoras activas de StereoFace Frequencies. Solo metadatos y los enlaces que el NAVEGADOR usa para
 * conectarse directamente al origen de la señal: este servidor no hace de proxy ni retransmite audio.
 */
export async function GET() {
  try {
    const stations = await listPublicStations(await getDb());
    return Response.json(
      { stations },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=30" } },
    );
  } catch (error) {
    console.error("[radio/stations]", error);
    return Response.json(
      { stations: [], error: "No disponible" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
