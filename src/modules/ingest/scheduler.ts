import { getDb } from "@/lib/db";
import { runDueSources } from "./run";

const TICK_MS = 60_000;
const FIRST_TICK_MS = 30_000;

type Holder = { __sfIngest?: { timer: ReturnType<typeof setTimeout>; running: boolean } };

/**
 * Planificador interno de la ingesta: cada minuto revisa qué fuentes les toca (según su intervalo) y las lee. Vive en el propio
 * servidor web (una sola instancia). Si algún día hay varias, no se duplica trabajo: cada fuente se «reclama» en la base de datos.
 * Se apaga con INGEST_SCHEDULER=off. La marca en `globalThis` evita arrancarlo dos veces con la recarga en caliente.
 */
export function startIngestScheduler(): void {
  const g = globalThis as Holder;
  if (g.__sfIngest || process.env.INGEST_SCHEDULER === "off") return;
  const state = { timer: undefined as unknown as ReturnType<typeof setTimeout>, running: false };
  g.__sfIngest = state;

  const tick = async () => {
    if (!state.running) {
      state.running = true;
      try {
        const results = await runDueSources(await getDb());
        for (const r of results) console.info("[ingest]", r.id, "error" in r.result ? r.result.error : r.result.message);
      } catch (error) {
        console.error("[ingest] fallo del planificador", error);
      } finally {
        state.running = false;
      }
    }
    state.timer = setTimeout(() => void tick(), TICK_MS);
    state.timer.unref?.();
  };
  state.timer = setTimeout(() => void tick(), FIRST_TICK_MS);
  state.timer.unref?.();
}
