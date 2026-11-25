import { describe, expect, it } from "vitest";
import { endsAtMs, formatClock, formatDayShort, formatRemaining, sumDurations } from "@/ui/studio/zara-format";

describe("formatRemaining", () => {
  it("minutos, segundos y décimas", () => {
    expect(formatRemaining(132.74)).toBe("02:12.7");
    expect(formatRemaining(0)).toBe("00:00.0");
    expect(formatRemaining(9.99)).toBe("00:09.9");
    expect(formatRemaining(59.96)).toBe("00:59.9");
  });
  it("con horas cuando pasa de 60 minutos", () => {
    expect(formatRemaining(3600)).toBe("1:00:00.0");
    expect(formatRemaining(3 * 3600 + 5 * 60 + 9.3)).toBe("3:05:09.3");
  });
  it("sin dato o negativo", () => {
    for (const v of [null, undefined, NaN, Infinity, -1]) expect(formatRemaining(v as number)).toBe("--:--.-");
  });
});

describe("relojes (hora de Bogotá)", () => {
  it("UTC−5 fijo", () => {
    expect(formatClock(Date.UTC(2026, 10, 23, 18, 45, 13))).toBe("13:45:13");
    expect(formatClock(Date.UTC(2026, 10, 24, 4, 59, 59))).toBe("23:59:59");
  });
  it("día corto sin puntos", () => {
    const d = formatDayShort(Date.UTC(2026, 10, 23, 18, 0, 0));
    expect(d).toBe("lun, 23 nov"); // 23 de noviembre de 2026 es lunes
  });
});

describe("sumDurations / endsAtMs", () => {
  it("ignora pistas sin duración", () => {
    expect(sumDurations([100, null, undefined, 0, NaN, 20.5])).toBe(120.5);
    expect(sumDurations([])).toBe(0);
  });
  it("hora de fin", () => {
    expect(endsAtMs(1000, 2)).toBe(3000);
    expect(endsAtMs(1000, null)).toBeNull();
    expect(endsAtMs(1000, -3)).toBeNull();
  });
});
