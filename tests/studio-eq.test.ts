import { describe, expect, it } from "vitest";
import { EQ_BANDS, EQ_PRESETS, FLAT_EQ, clampEq } from "@/ui/studio/engine/eq";

describe("clampEq", () => {
  it("acota a ±12 dB y convierte NaN en 0", () => {
    expect(clampEq({ low: 40, mid: -40, high: NaN })).toEqual({ low: 12, mid: -12, high: 0 });
  });
  it("deja pasar valores válidos", () => {
    expect(clampEq({ low: 3, mid: -2.5, high: 0 })).toEqual({ low: 3, mid: -2.5, high: 0 });
  });
});

describe("EQ_BANDS", () => {
  it("define tres bandas: graves 100 Hz, medios 1 kHz, agudos 8 kHz", () => {
    expect(EQ_BANDS.map((b) => [b.key, b.type, b.frequency])).toEqual([
      ["low", "lowshelf", 100],
      ["mid", "peaking", 1000],
      ["high", "highshelf", 8000],
    ]);
  });
});

describe("EQ_PRESETS", () => {
  it("«plano» no altera nada", () => {
    expect(EQ_PRESETS.plano.music).toEqual(FLAT_EQ);
    expect(EQ_PRESETS.plano.mic).toEqual(FLAT_EQ);
  });
  it("«voz» aclara el micrófono: menos graves y más agudos", () => {
    expect(EQ_PRESETS.voz.mic.low).toBeLessThan(0);
    expect(EQ_PRESETS.voz.mic.high).toBeGreaterThan(0);
  });
  it("todos los presets están dentro del rango permitido", () => {
    for (const p of Object.values(EQ_PRESETS)) {
      expect(clampEq(p.music)).toEqual(p.music);
      expect(clampEq(p.mic)).toEqual(p.mic);
    }
  });
});
