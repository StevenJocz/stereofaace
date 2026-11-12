import { describe, expect, it } from "vitest";
import { PeakHold, peakToDb, rmsToDb } from "@/ui/studio/engine/meter";

const sine = (amp: number, n = 4800) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * i * 10) / n));

describe("niveles en dB", () => {
  it("un seno de amplitud 1 tiene pico 0 dB y RMS −3 dB", () => {
    expect(peakToDb(sine(1))).toBeCloseTo(0, 1);
    expect(rmsToDb(sine(1))).toBeCloseTo(-3.01, 1);
  });

  it("amplitud 0.5 baja 6 dB", () => {
    expect(peakToDb(sine(0.5))).toBeCloseTo(-6.02, 1);
  });

  it("el silencio vale −100 dB y un buffer vacío no rompe", () => {
    expect(peakToDb(new Float32Array(100))).toBe(-100);
    expect(rmsToDb(new Float32Array(100))).toBe(-100);
    expect(rmsToDb(new Float32Array(0))).toBe(-100);
  });
});

describe("PeakHold", () => {
  it("retiene el pico y luego cae", () => {
    const h = new PeakHold(1000, 20);
    expect(h.update(-6, 0)).toBe(-6);
    expect(h.update(-40, 500)).toBe(-6);
    expect(h.update(-40, 2000)).toBeCloseTo(-26, 0);
  });

  it("un pico nuevo mayor reemplaza al retenido", () => {
    const h = new PeakHold(1000, 20);
    h.update(-20, 0);
    expect(h.update(-3, 100)).toBe(-3);
  });

  it("nunca baja del piso de −100 dB", () => {
    const h = new PeakHold(0, 1000);
    h.update(-90, 0);
    expect(h.update(-100, 10_000)).toBe(-100);
  });
});
