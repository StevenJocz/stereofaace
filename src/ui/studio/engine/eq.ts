/** Ecualizador de 3 bandas (graves, medios, agudos) para la música y para el micrófono. */
export type EqSettings = { low: number; mid: number; high: number };

export const FLAT_EQ: EqSettings = { low: 0, mid: 0, high: 0 };

export const EQ_BANDS = [
  { key: "low", type: "lowshelf", frequency: 100, q: 0.7 },
  { key: "mid", type: "peaking", frequency: 1000, q: 1 },
  { key: "high", type: "highshelf", frequency: 8000, q: 0.7 },
] as const satisfies readonly { key: keyof EqSettings; type: BiquadFilterType; frequency: number; q: number }[];

const clampBand = (v: number) => (Number.isFinite(v) ? Math.min(12, Math.max(-12, v)) : 0);

export function clampEq(e: EqSettings): EqSettings {
  return { low: clampBand(e.low), mid: clampBand(e.mid), high: clampBand(e.high) };
}

export type EqPresetKey = "plano" | "voz" | "brillante";

export const EQ_PRESETS: Record<EqPresetKey, { label: string; music: EqSettings; mic: EqSettings }> = {
  plano: { label: "Plano", music: FLAT_EQ, mic: FLAT_EQ },
  voz: { label: "Voz de radio", music: { low: 0, mid: -2, high: 0 }, mic: { low: -4, mid: 2, high: 3 } },
  brillante: { label: "Música brillante", music: { low: 2, mid: 0, high: 3 }, mic: { low: -2, mid: 1, high: 2 } },
};
