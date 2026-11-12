/** Cuándo empieza el fundido hacia la pista siguiente (null = no se puede planificar). */
export function planCrossfade(input: {
  durationSec: number;
  fadeSec: number;
  minTrackSec?: number;
}): { startAtSec: number; fadeSec: number } | null {
  const { durationSec, fadeSec } = input;
  const minTrackSec = input.minTrackSec ?? fadeSec * 2;
  if (!Number.isFinite(durationSec) || !Number.isFinite(fadeSec) || fadeSec <= 0) return null;
  if (durationSec < minTrackSec) return null;
  return { startAtSec: durationSec - fadeSec, fadeSec };
}

/** Curva de potencia constante: `out` baja de 1 a 0 y `in` sube de 0 a 1 con `progress` en [0,1]. */
export function equalPowerGains(progress: number): { out: number; in: number } {
  const p = Math.min(1, Math.max(0, progress));
  return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) };
}

/**
 * Número de generación de los fundidos: cada fundido nuevo (o corte) invalida el temporizador de limpieza del anterior,
 * para que un fundido viejo no fuerce las ganancias de uno más reciente (silencio al aire).
 */
export class FadeGeneration {
  private current = 0;
  begin(): number {
    return ++this.current;
  }
  isCurrent(n: number): boolean {
    return n === this.current;
  }
}
