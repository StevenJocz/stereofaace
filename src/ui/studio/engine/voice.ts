/** Ducking y puerta de ruido: decisiones puras a partir del nivel del micrófono (sin Web Audio). */

const FLOOR_DB = -100;
const clamp = (v: number, lo: number, hi: number, fallback: number) =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const gainToDb = (g: number): number => (g <= 0 ? FLOOR_DB : Math.max(FLOOR_DB, 20 * Math.log10(g)));

export type DuckSettings = {
  enabled: boolean;
  reductionDb: number;
  thresholdDb: number;
  attackMs: number;
  releaseMs: number;
};

export const DEFAULT_DUCK: DuckSettings = { enabled: true, reductionDb: -12, thresholdDb: -45, attackMs: 150, releaseMs: 1200 };

export function clampDuck(s: DuckSettings): DuckSettings {
  return {
    enabled: s.enabled,
    reductionDb: clamp(s.reductionDb, -40, 0, DEFAULT_DUCK.reductionDb),
    thresholdDb: clamp(s.thresholdDb, -80, -10, DEFAULT_DUCK.thresholdDb),
    attackMs: clamp(s.attackMs, 10, 1000, DEFAULT_DUCK.attackMs),
    releaseMs: clamp(s.releaseMs, 100, 5000, DEFAULT_DUCK.releaseMs),
  };
}

const HOLD_MS = 300;

/**
 * Decide la ganancia de la música de fondo. Baja cuando la voz supera el umbral de forma sostenida
 * (al menos `attackMs`), la mantiene `HOLD_MS` entre palabras y después sube con una rampa de `releaseMs`.
 */
export class DuckController {
  private s: DuckSettings;
  private forced = false;
  private voiceSince: number | null = null;
  private lastVoice: number | null = null;
  private ducked = false;

  constructor(settings: DuckSettings) {
    this.s = clampDuck(settings);
  }

  setSettings(s: DuckSettings): void {
    this.s = clampDuck(s);
  }

  setForced(on: boolean): void {
    this.forced = on;
  }

  update(input: { micDb: number; micMuted: boolean; nowMs: number }): { targetGain: number; timeConstantSec: number } {
    const { micDb, micMuted, nowMs } = input;
    const speaking = !micMuted && micDb > this.s.thresholdDb;
    if (speaking) {
      this.voiceSince ??= nowMs;
      this.lastVoice = nowMs;
    } else {
      this.voiceSince = null;
    }
    const sustained = speaking && this.voiceSince !== null && nowMs - this.voiceSince >= this.s.attackMs;
    const holding = !micMuted && this.lastVoice !== null && nowMs - this.lastVoice < HOLD_MS && this.ducked;

    let wantDown: boolean;
    if (!this.s.enabled && !this.forced) wantDown = false;
    else if (this.forced) wantDown = true;
    else if (micMuted) wantDown = false;
    else wantDown = sustained || holding;

    this.ducked = wantDown;
    if (this.forced) this.lastVoice = nowMs; // al soltar el modo forzado, la música sube tras la recuperación
    return {
      targetGain: wantDown ? dbToGain(this.s.reductionDb) : 1,
      timeConstantSec: (wantDown ? this.s.attackMs : this.s.releaseMs) / 1000 / 3,
    };
  }
}

/** Puerta de ruido: abierta (1) con voz y durante `holdMs` después; cerrada (0) en silencio. */
export class GateController {
  private lastOpen = -Infinity;

  constructor(
    private readonly thresholdDb: number,
    private readonly holdMs = 200,
  ) {}

  update(micDb: number, nowMs: number): number {
    if (micDb > this.thresholdDb) this.lastOpen = nowMs;
    return nowMs - this.lastOpen <= this.holdMs ? 1 : 0;
  }
}
