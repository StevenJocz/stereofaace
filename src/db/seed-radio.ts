/**
 * Emisoras iniciales de StereoFace Frequencies.
 *
 *  - The Lot Radio: registro DESACTIVADO y con autorización PENDIENTE. No lleva URL de señal a propósito:
 *    solo se activará cuando exista autorización escrita de retransmisión o un reproductor oficial integrable.
 *  - Señal de prueba (solo desarrollo): stream HLS público de pruebas, marcado demo. No se siembra en producción.
 */
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { radioStations } from "@/modules/radio/schema";

export async function seedRadioDefaults(db: Db): Promise<void> {
  await db
    .insert(radioStations)
    .values({
      slug: "the-lot-radio",
      name: "The Lot Radio",
      description:
        "Emisora independiente. Integración preparada y desactivada hasta contar con autorización de retransmisión o un reproductor oficial integrable.",
      streamKind: "embed",
      streamUrl: null,
      embedUrl: null,
      websiteUrl: "https://www.thelotradio.com",
      attributionName: "The Lot Radio",
      attributionUrl: "https://www.thelotradio.com",
      attributionNote: "Señal y programación © The Lot Radio.",
      authorizationStatus: "pending",
      authorizationNotes:
        "PENDIENTE: solicitar permiso por escrito para retransmitir/enlazar la señal, o integrar su reproductor oficial. Sin URL configurada a propósito.",
      enabled: false,
      position: 10,
    })
    .onConflictDoNothing();
}

export async function seedRadioDevTestStream(db: Db): Promise<void> {
  await db.delete(radioStations).where(and(eq(radioStations.isDemo, true), eq(radioStations.slug, "senal-de-prueba")));
  await db.insert(radioStations).values({
    slug: "senal-de-prueba",
    name: "Señal de prueba (desarrollo)",
    description: "Stream HLS público de pruebas para verificar el reproductor. No es una emisora real.",
    streamKind: "hls",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    corsEnabled: true,
    websiteUrl: "https://test-streams.mux.dev",
    attributionName: "Mux · test-streams.mux.dev",
    attributionUrl: "https://test-streams.mux.dev",
    attributionNote: "Stream público de pruebas publicado para desarrolladores.",
    authorizationStatus: "not_required",
    authorizationNotes:
      "Stream de pruebas de acceso público (test-streams.mux.dev) usado solo en desarrollo. No se siembra en producción.",
    enabled: true,
    position: 0,
    isDemo: true,
  });
}
