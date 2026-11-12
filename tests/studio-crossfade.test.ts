import { describe, expect, it } from "vitest";
import { equalPowerGains, planCrossfade } from "@/ui/studio/engine/crossfade";

describe("planCrossfade", () => {
  it("empieza fadeSec antes del final", () => {
    expect(planCrossfade({ durationSec: 200, fadeSec: 6 })).toEqual({ startAtSec: 194, fadeSec: 6 });
  });

  it("devuelve null con duración ilegible (NaN, Infinity)", () => {
    expect(planCrossfade({ durationSec: NaN, fadeSec: 6 })).toBeNull();
    expect(planCrossfade({ durationSec: Infinity, fadeSec: 6 })).toBeNull();
  });

  it("devuelve null si la pista es demasiado corta o el fundido no es positivo", () => {
    expect(planCrossfade({ durationSec: 5, fadeSec: 6 })).toBeNull();
    expect(planCrossfade({ durationSec: 200, fadeSec: 0 })).toBeNull();
    expect(planCrossfade({ durationSec: 200, fadeSec: -2 })).toBeNull();
  });

  it("respeta minTrackSec", () => {
    expect(planCrossfade({ durationSec: 20, fadeSec: 6, minTrackSec: 30 })).toBeNull();
    expect(planCrossfade({ durationSec: 40, fadeSec: 6, minTrackSec: 30 })).toEqual({ startAtSec: 34, fadeSec: 6 });
  });
});

describe("equalPowerGains", () => {
  it("va de (1,0) a (0,1)", () => {
    const a = equalPowerGains(0);
    const b = equalPowerGains(1);
    expect(a.out).toBeCloseTo(1);
    expect(a.in).toBeCloseTo(0);
    expect(b.out).toBeCloseTo(0);
    expect(b.in).toBeCloseTo(1);
  });

  it("mantiene la potencia constante en el punto medio", () => {
    const m = equalPowerGains(0.5);
    expect(m.out ** 2 + m.in ** 2).toBeCloseTo(1);
  });

  it("acota valores fuera de [0,1]", () => {
    expect(equalPowerGains(-1)).toEqual(equalPowerGains(0));
    expect(equalPowerGains(2)).toEqual(equalPowerGains(1));
  });
});
