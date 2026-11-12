import { describe, expect, it } from "vitest";
import { createLiveStore } from "@/ui/studio/live-store";

describe("liveStore", () => {
  it("avisa a quien escucha solo cuando cambia algo y entrega siempre el mismo objeto si no cambió", () => {
    const s = createLiveStore();
    let calls = 0;
    const off = s.subscribe(() => calls++);
    const a = s.get();
    s.set({ live: true, since: 1000, program: "Electronic Selection", endsAt: 5000 });
    expect(calls).toBe(1);
    expect(s.get()).not.toBe(a);
    const b = s.get();
    s.set({ live: true, since: 1000, program: "Electronic Selection", endsAt: 5000 }); // igual: sin aviso
    expect(calls).toBe(1);
    expect(s.get()).toBe(b);
    off();
    s.set({ live: false, since: null, program: null, endsAt: null });
    expect(calls).toBe(1);
  });

  it("requestStop llama a la función que registró la consola y no falla si no hay ninguna", () => {
    const s = createLiveStore();
    expect(() => s.requestStop()).not.toThrow();
    let stopped = 0;
    const unregister = s.registerStop(() => stopped++);
    s.requestStop();
    expect(stopped).toBe(1);
    unregister();
    s.requestStop();
    expect(stopped).toBe(1);
  });
});
