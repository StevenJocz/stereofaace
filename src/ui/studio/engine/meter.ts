const FLOOR_DB = -100;

const toDb = (linear: number) => (linear <= 0 ? FLOOR_DB : Math.max(FLOOR_DB, 20 * Math.log10(linear)));

/** Pico de un bloque de muestras, en dB (0 dB = amplitud 1). */
export function peakToDb(samples: Float32Array): number {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return toDb(peak);
}

/** Valor RMS de un bloque de muestras, en dB. */
export function rmsToDb(samples: Float32Array): number {
  if (samples.length === 0) return FLOOR_DB;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return toDb(Math.sqrt(sum / samples.length));
}

/** Retiene el pico `holdMs` y después lo deja caer `decayDbPerSec`. */
export class PeakHold {
  private value = FLOOR_DB;
  private at = 0;

  constructor(
    private readonly holdMs: number,
    private readonly decayDbPerSec: number,
  ) {}

  update(db: number, nowMs: number): number {
    const held = this.value;
    const idleMs = nowMs - this.at;
    const decayed =
      idleMs > this.holdMs ? Math.max(FLOOR_DB, held - ((idleMs - this.holdMs) / 1000) * this.decayDbPerSec) : held;
    if (db >= decayed) {
      this.value = db;
      this.at = nowMs;
      return db;
    }
    return decayed;
  }
}
