import { describe, expect, it } from "vitest";
import { airTimeLeft, formatClock } from "@/ui/studio/engine/countdown";

const MIN = 60_000;
const end = Date.parse("2026-11-12T19:00:00Z");

describe("formatClock", () => {
  it("HH:MM:SS con ceros y sin negativos", () => {
    expect(formatClock(0)).toBe("00:00:00");
    expect(formatClock(3_725_000)).toBe("01:02:05");
    expect(formatClock(-5000)).toBe("00:00:00");
    expect(formatClock(59_999)).toBe("00:00:59"); // nunca redondea hacia arriba un segundo que aún no pasó
  });
});

describe("airTimeLeft", () => {
  it("sin hora de fin no hay cuenta regresiva", () => {
    expect(airTimeLeft(null, end)).toBeNull();
  });
  it("mucho margen: nivel ok", () => {
    expect(airTimeLeft(end, end - 42 * MIN)).toEqual({ text: "00:42:00", level: "ok", ended: false });
  });
  it("a 5 minutos o menos avisa (warn) y a 1 minuto o menos es urgente", () => {
    expect(airTimeLeft(end, end - 5 * MIN)?.level).toBe("warn");
    expect(airTimeLeft(end, end - 90_000)?.level).toBe("warn");
    expect(airTimeLeft(end, end - MIN)?.level).toBe("urgent");
  });
  it("al llegar la hora de fin se marca terminado", () => {
    expect(airTimeLeft(end, end)).toEqual({ text: "00:00:00", level: "urgent", ended: true });
    expect(airTimeLeft(end, end + 10_000)?.ended).toBe(true);
  });
});
