/** Se ejecuta una vez al arrancar el servidor de Node: pone en marcha la lectura periódica de las fuentes de noticias. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startIngestScheduler } = await import("@/modules/ingest/scheduler");
  startIngestScheduler();
}
