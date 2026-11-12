import { describe, expect, it } from "vitest";
import { LoadGate, pickNext, shouldAdvanceOnEnd, shouldStartFade } from "@/ui/studio/engine/autoplay";
import type { QueueItem } from "@/ui/studio/engine/queue";

const it_ = (id: string): QueueItem => ({ id, file: null, url: null, title: id, artist: "", durationSec: null, source: "local" });
const base = { deckId: "A" as const, activeId: "A" as const, handedOff: false, fading: false, auto: true, fadeSec: 6 };

describe("shouldStartFade", () => {
  it("dispara dentro de la ventana final del deck activo", () => {
    expect(shouldStartFade({ ...base, current: 195, duration: 200 })).toBe(true);
  });
  it("no dispara antes de la ventana", () => {
    expect(shouldStartFade({ ...base, current: 100, duration: 200 })).toBe(false);
  });
  it("no dispara si el deck ya cedió el aire (evita el segundo fundido por timeupdate repetido)", () => {
    expect(shouldStartFade({ ...base, handedOff: true, current: 195, duration: 200 })).toBe(false);
  });
  it("no dispara con un fundido en curso, deck inactivo o automático apagado", () => {
    expect(shouldStartFade({ ...base, fading: true, current: 195, duration: 200 })).toBe(false);
    expect(shouldStartFade({ ...base, activeId: "B", current: 195, duration: 200 })).toBe(false);
    expect(shouldStartFade({ ...base, auto: false, current: 195, duration: 200 })).toBe(false);
  });
  it("no dispara con duración ilegible o pista demasiado corta", () => {
    expect(shouldStartFade({ ...base, current: 5, duration: NaN })).toBe(false);
    expect(shouldStartFade({ ...base, current: 5, duration: 0 })).toBe(false);
    expect(shouldStartFade({ ...base, current: 8, duration: 10 })).toBe(false);
  });
});

describe("shouldAdvanceOnEnd", () => {
  it("avanza cuando termina el deck activo que no había cedido el aire y hay siguiente", () => {
    expect(shouldAdvanceOnEnd({ ...base, hasNext: true })).toBe(true);
  });
  it("no avanza si ya se hizo el fundido, hay fundido en curso, no hay siguiente o auto está apagado", () => {
    expect(shouldAdvanceOnEnd({ ...base, handedOff: true, hasNext: true })).toBe(false);
    expect(shouldAdvanceOnEnd({ ...base, fading: true, hasNext: true })).toBe(false);
    expect(shouldAdvanceOnEnd({ ...base, hasNext: false })).toBe(false);
    expect(shouldAdvanceOnEnd({ ...base, auto: false, hasNext: true })).toBe(false);
  });
  it("no avanza si el deck que terminó no es el activo", () => {
    expect(shouldAdvanceOnEnd({ ...base, activeId: "B", hasNext: true })).toBe(false);
  });
});

describe("pickNext", () => {
  it("prefiere la pista precargada y detenida en el otro deck", () => {
    expect(pickNext({ queue: [it_("q1")], otherDeckItem: it_("pre"), otherDeckPlaying: false, otherDeckConsumed: false })).toEqual({ source: "deck" });
  });
  it("si el otro deck suena, no lo pisa: toma la cabeza de la cola", () => {
    const q = it_("q1");
    expect(pickNext({ queue: [q], otherDeckItem: it_("suena"), otherDeckPlaying: true, otherDeckConsumed: false })).toEqual({ source: "queue", item: q });
  });
  it("un deck que ya sonó y cedió el aire no se reutiliza como pista precargada (evita repetir la anterior)", () => {
    const q = it_("q1");
    expect(pickNext({ queue: [q], otherDeckItem: it_("ya sonó"), otherDeckPlaying: false, otherDeckConsumed: true })).toEqual({ source: "queue", item: q });
    expect(pickNext({ queue: [], otherDeckItem: it_("ya sonó"), otherDeckPlaying: false, otherDeckConsumed: true })).toBeNull();
  });
  it("con el otro deck vacío toma la cola; sin nada devuelve null", () => {
    const q = it_("q1");
    expect(pickNext({ queue: [q], otherDeckItem: null, otherDeckPlaying: false, otherDeckConsumed: false })).toEqual({ source: "queue", item: q });
    expect(pickNext({ queue: [], otherDeckItem: null, otherDeckPlaying: false, otherDeckConsumed: false })).toBeNull();
  });
});

describe("LoadGate", () => {
  it("solo la última carga es vigente", () => {
    const g = new LoadGate();
    const a = g.next();
    const b = g.next();
    expect(g.isCurrent(a)).toBe(false);
    expect(g.isCurrent(b)).toBe(true);
  });
  it("invalidate deja vigente a nadie", () => {
    const g = new LoadGate();
    const a = g.next();
    g.invalidate();
    expect(g.isCurrent(a)).toBe(false);
  });
});
