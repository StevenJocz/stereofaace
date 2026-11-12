import { describe, expect, it } from "vitest";
import { DEFAULT_DUCK, DuckController, GateController, clampDuck, dbToGain, gainToDb } from "@/ui/studio/engine/voice";

describe("conversión dB", () => {
  it("dbToGain y gainToDb", () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
    expect(gainToDb(0)).toBe(-100);
    expect(gainToDb(1)).toBeCloseTo(0);
  });
});

describe("clampDuck", () => {
  it("acota valores fuera de rango sin romper", () => {
    const c = clampDuck({ enabled: true, reductionDb: 5, thresholdDb: 0, attackMs: 1, releaseMs: 99999 });
    expect(c).toEqual({ enabled: true, reductionDb: 0, thresholdDb: -10, attackMs: 10, releaseMs: 5000 });
    expect(clampDuck({ ...DEFAULT_DUCK, reductionDb: NaN }).reductionDb).toBe(DEFAULT_DUCK.reductionDb);
  });
});

describe("DuckController", () => {
  const voice = { micDb: -30, micMuted: false };
  const quiet = { micDb: -90, micMuted: false };
  const down = dbToGain(DEFAULT_DUCK.reductionDb);

  it("no baja con un ruido más corto que el ataque", () => {
    const d = new DuckController(DEFAULT_DUCK);
    expect(d.update({ ...voice, nowMs: 0 }).targetGain).toBe(1);
    expect(d.update({ ...voice, nowMs: 100 }).targetGain).toBe(1);
  });

  it("baja a la reducción cuando la voz es sostenida", () => {
    const d = new DuckController(DEFAULT_DUCK);
    d.update({ ...voice, nowMs: 0 });
    expect(d.update({ ...voice, nowMs: 200 }).targetGain).toBeCloseTo(down, 3);
  });

  it("mantiene la música baja entre palabras (hold) y recupera tras el silencio", () => {
    const d = new DuckController(DEFAULT_DUCK);
    d.update({ ...voice, nowMs: 0 });
    d.update({ ...voice, nowMs: 200 });
    expect(d.update({ ...quiet, nowMs: 400 }).targetGain).toBeCloseTo(down, 3);
    expect(d.update({ ...quiet, nowMs: 1800 }).targetGain).toBe(1);
  });

  it("tras el hold (300 ms) el objetivo vuelve a 1 y la rampa de recuperación la hace gradual", () => {
    const d = new DuckController(DEFAULT_DUCK);
    d.update({ ...voice, nowMs: 0 });
    d.update({ ...voice, nowMs: 200 });
    expect(d.update({ ...quiet, nowMs: 450 }).targetGain).toBeCloseTo(down, 3); // 250 ms sin voz: aún en hold
    const up = d.update({ ...quiet, nowMs: 600 }); // 400 ms sin voz: hold terminado
    expect(up.targetGain).toBe(1);
    expect(up.timeConstantSec).toBeCloseTo(DEFAULT_DUCK.releaseMs / 1000 / 3, 4);
  });

  it("silenciar el micrófono libera la música; deshabilitado no baja", () => {
    const d = new DuckController(DEFAULT_DUCK);
    d.update({ ...voice, nowMs: 0 });
    d.update({ ...voice, nowMs: 200 });
    expect(d.update({ ...voice, micMuted: true, nowMs: 300 }).targetGain).toBe(1);
    const off = new DuckController({ ...DEFAULT_DUCK, enabled: false });
    off.update({ ...voice, nowMs: 0 });
    expect(off.update({ ...voice, nowMs: 500 }).targetGain).toBe(1);
  });

  it("el modo forzado baja sin voz y suelta al desactivarse", () => {
    const d = new DuckController(DEFAULT_DUCK);
    d.setForced(true);
    expect(d.update({ ...quiet, nowMs: 0 }).targetGain).toBeCloseTo(down, 3);
    d.setForced(false);
    expect(d.update({ ...quiet, nowMs: 100 }).targetGain).toBeCloseTo(down, 3);
    expect(d.update({ ...quiet, nowMs: 2000 }).targetGain).toBe(1);
  });

  it("usa constantes de tiempo según baje o suba", () => {
    const d = new DuckController(DEFAULT_DUCK);
    d.update({ ...voice, nowMs: 0 });
    const downStep = d.update({ ...voice, nowMs: 200 });
    expect(downStep.timeConstantSec).toBeCloseTo(DEFAULT_DUCK.attackMs / 1000 / 3, 4);
    const upStep = d.update({ ...quiet, nowMs: 3000 });
    expect(upStep.timeConstantSec).toBeCloseTo(DEFAULT_DUCK.releaseMs / 1000 / 3, 4);
  });
});

describe("GateController", () => {
  it("abre con voz, retiene 200 ms y cierra", () => {
    const g = new GateController(-50);
    expect(g.update(-60, 0)).toBe(0);
    expect(g.update(-40, 10)).toBe(1);
    expect(g.update(-60, 110)).toBe(1);
    expect(g.update(-60, 300)).toBe(0);
  });
});
