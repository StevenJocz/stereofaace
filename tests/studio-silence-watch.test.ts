import { describe, expect, it } from "vitest";
import { SilenceWatch } from "@/ui/studio/engine/silence-watch";

describe("fin de un audio externo (silencio tras haber sonado)", () => {
  it("avisa una sola vez cuando, tras sonar, pasa más de 6 s en silencio", () => {
    const w = new SilenceWatch();
    expect(w.push(-20, 0)).toBe(false); // suena
    expect(w.push(-70, 500)).toBe(false); // empieza el silencio
    expect(w.push(-70, 6000)).toBe(false); // 5,5 s: aún no
    expect(w.push(-70, 6600)).toBe(true); // más de 6 s
    expect(w.push(-70, 7000)).toBe(false); // no repite
  });
  it("una pausa corta (menos de 6 s) no cuenta como final y reinicia la cuenta al volver a sonar", () => {
    const w = new SilenceWatch();
    w.push(-20, 0);
    expect(w.push(-70, 1000)).toBe(false);
    expect(w.push(-30, 4000)).toBe(false); // volvió a sonar
    expect(w.push(-70, 5000)).toBe(false);
    expect(w.push(-70, 10500)).toBe(false); // solo 5,5 s desde que volvió el silencio
    expect(w.push(-70, 11100)).toBe(true);
  });
  it("si nunca sonó (por ejemplo, aún no dieron play) no hay final", () => {
    const w = new SilenceWatch();
    for (let t = 0; t < 60_000; t += 500) expect(w.push(-90, t)).toBe(false);
  });
  it("puede volver a detectar otro final después de reanudar", () => {
    const w = new SilenceWatch();
    w.push(-20, 0);
    expect(w.push(-70, 100) || w.push(-70, 7000)).toBe(true);
    expect(w.push(-70, 8000)).toBe(false);
    w.push(-20, 9000);
    w.push(-70, 9500);
    expect(w.push(-70, 16000)).toBe(true);
  });
});
