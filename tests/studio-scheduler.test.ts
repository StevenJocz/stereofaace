import { describe, expect, it } from "vitest";
import { GRACE_MS, bogotaMidnight, dueOccurrences, eventAction, eventDurationSec, eventToQueue, isoWeekday, nextOccurrence, occurrencesOfDay, todaysEvents, type SchedEvent } from "@/ui/studio/engine/scheduler";
import { queueReducer, type QueueItem } from "@/ui/studio/engine/queue";

// 23 de noviembre de 2026 es lunes. Bogotá = UTC−5.
const at = (day: number, hh: number, mm = 0, ss = 0) => Date.UTC(2026, 10, day, hh + 5, mm, ss); // hora local de Bogotá → ms UTC
const ev = (over: Partial<SchedEvent> & { id: string }): SchedEvent => ({ name: over.id, minuteOfDay: 14 * 60, days: [1, 2, 3, 4, 5, 6, 7], mode: "delayed", transition: "fade", active: true, items: [], ...over });

describe("hora de Bogotá", () => {
  it("medianoche local y día ISO", () => {
    expect(bogotaMidnight(at(23, 13, 45))).toBe(Date.UTC(2026, 10, 23, 5, 0, 0));
    expect(bogotaMidnight(at(23, 0, 0))).toBe(Date.UTC(2026, 10, 23, 5, 0, 0));
    expect(bogotaMidnight(at(23, 23, 59, 59))).toBe(Date.UTC(2026, 10, 23, 5, 0, 0));
    expect(isoWeekday(at(23, 13, 45))).toBe(1); // lunes
    expect(isoWeekday(at(22, 22, 0))).toBe(7); // domingo
    expect(isoWeekday(at(28, 8, 0))).toBe(6); // sábado
  });
  it("las 22:00 en Bogotá siguen siendo el mismo día aunque en UTC ya sea el siguiente", () => {
    const ms = Date.UTC(2026, 10, 24, 3, 0, 0); // 24/11 03:00 UTC = 23/11 22:00 Bogotá
    expect(isoWeekday(ms)).toBe(1);
    expect(bogotaMidnight(ms)).toBe(Date.UTC(2026, 10, 23, 5, 0, 0));
  });
});

describe("eventos del día", () => {
  const events = [ev({ id: "b", minuteOfDay: 15 * 60 }), ev({ id: "a", minuteOfDay: 6 * 60 + 30 }), ev({ id: "off", active: false }), ev({ id: "finde", days: [6, 7] }), ev({ id: "lunes", days: [1], minuteOfDay: 9 * 60 })];
  it("solo los activos que corren ese día, por hora", () => {
    expect(occurrencesOfDay(events, at(23, 12)).map((o) => o.event.id)).toEqual(["a", "lunes", "b"]);
    expect(occurrencesOfDay(events, at(28, 12)).map((o) => o.event.id)).toEqual(["a", "finde", "b"]);
  });
  it("la clave es única por evento y día", () => {
    const k1 = occurrencesOfDay(events, at(23, 12))[0].key;
    const k2 = occurrencesOfDay(events, at(24, 12))[0].key;
    expect(k1).not.toBe(k2);
    expect(k1).toBe("a:2026-11-23");
  });
  it("la lista de hoy incluye también los desactivados", () => {
    expect(todaysEvents(events, at(23, 12)).map((o) => o.event.id)).toEqual(["a", "lunes", "off", "b"]);
  });
});

describe("eventos que ya tocan", () => {
  const e = [ev({ id: "fijo", mode: "fixed", minuteOfDay: 14 * 60 }), ev({ id: "ret", mode: "delayed", minuteOfDay: 14 * 60 })];
  it("no antes de su hora", () => {
    expect(dueOccurrences(e, at(23, 13, 59, 59), new Set())).toEqual([]);
  });
  it("justo a su hora entran los dos, en orden estable", () => {
    expect(dueOccurrences(e, at(23, 14, 0, 0), new Set()).map((o) => o.event.id)).toEqual(["fijo", "ret"]);
  });
  it("un evento Fijo caduca a los 90 s; uno Retardado, a los 5 minutos", () => {
    expect(dueOccurrences(e, at(23, 14, 0, 0) + GRACE_MS.fixed, new Set()).map((o) => o.event.id)).toEqual(["fijo", "ret"]);
    expect(dueOccurrences(e, at(23, 14, 0, 0) + GRACE_MS.fixed + 1000, new Set()).map((o) => o.event.id)).toEqual(["ret"]);
    expect(dueOccurrences(e, at(23, 14, 0, 0) + GRACE_MS.delayed + 1000, new Set())).toEqual([]);
  });
  it("no repite lo ya disparado hoy, pero sí al día siguiente", () => {
    const fired = new Set(["fijo:2026-11-23"]);
    expect(dueOccurrences(e, at(23, 14, 0, 30), fired).map((o) => o.event.id)).toEqual(["ret"]);
    expect(dueOccurrences(e, at(24, 14, 0, 30), fired).map((o) => o.event.id)).toEqual(["fijo", "ret"]);
  });
  it("ignora inactivos y días en que no corren", () => {
    expect(dueOccurrences([ev({ id: "x", active: false })], at(23, 14, 0, 5), new Set())).toEqual([]);
    expect(dueOccurrences([ev({ id: "x", days: [2] })], at(23, 14, 0, 5), new Set())).toEqual([]);
  });
  it("una consola que abre tarde no dispara eventos viejos de la mañana", () => {
    expect(dueOccurrences([ev({ id: "m", minuteOfDay: 6 * 60 })], at(23, 18, 0), new Set())).toEqual([]);
  });
});

describe("próximo evento", () => {
  const e = [ev({ id: "a", minuteOfDay: 9 * 60, days: [1, 3] }), ev({ id: "b", minuteOfDay: 20 * 60, days: [1] })];
  it("el siguiente de hoy", () => {
    expect(nextOccurrence(e, at(23, 8, 0))?.event.id).toBe("a");
    expect(nextOccurrence(e, at(23, 12, 0))?.event.id).toBe("b");
  });
  it("si hoy ya no queda ninguno, el primero de los días siguientes", () => {
    const n = nextOccurrence(e, at(23, 21, 0))!;
    expect(n.event.id).toBe("a");
    expect(n.atMs).toBe(at(25, 9, 0)); // miércoles
  });
  it("da la vuelta a la semana y devuelve null sin eventos", () => {
    expect(nextOccurrence([ev({ id: "x", minuteOfDay: 8 * 60, days: [1] })], at(23, 9, 0))?.atMs).toBe(at(30, 8, 0));
    expect(nextOccurrence([], at(23, 9, 0))).toBeNull();
    expect(nextOccurrence([ev({ id: "x", active: false })], at(23, 9, 0))).toBeNull();
  });
});

describe("audios del evento", () => {
  const carts = [{ id: "c1", name: "Jingle", durationSec: 3.5 }];
  let n = 0;
  const makeId = () => `q${++n}`;
  it("suma las duraciones conocidas", () => {
    expect(eventDurationSec([{ kind: "cart", cartId: "c1", name: "J", durationSec: 3.5 }, { kind: "file", azId: "1", title: "T", artist: "", durationSec: null }, { kind: "file", azId: "2", title: "T", artist: "", durationSec: 10 }])).toBe(13.5);
  });
  it("convierte carts y pistas de la biblioteca en pistas de la cola, en orden", () => {
    const r = eventToQueue([{ kind: "cart", cartId: "c1", name: "Jingle", durationSec: 3 }, { kind: "file", azId: "42", title: "Promo", artist: "StereoFace", durationSec: 40 }], carts, makeId);
    expect(r.missing).toEqual([]);
    expect(r.items).toEqual([
      { id: "q1", file: null, url: "/api/studio/cart/c1", title: "Jingle", artist: "", durationSec: 3.5, source: "cart" },
      { id: "q2", file: null, url: "/api/studio/file/42", title: "Promo", artist: "StereoFace", durationSec: 40, source: "azuracast" },
    ]);
  });
  it("omite el cart que ya no está y lo avisa por nombre", () => {
    const r = eventToQueue([{ kind: "cart", cartId: "borrado", name: "Cortina vieja", durationSec: null }, { kind: "file", azId: "7", title: "X", artist: "", durationSec: 1 }], carts, makeId);
    expect(r.missing).toEqual(["Cortina vieja"]);
    expect(r.items).toHaveLength(1);
  });
});

describe("qué hace la consola al disparar", () => {
  it("sin nada sonando siempre arranca", () => {
    for (const mode of ["fixed", "delayed"] as const) expect(eventAction({ mode, transition: "fade", playing: false })).toBe("start");
  });
  it("Retardado espera; Fijo salta con fundido o en seco", () => {
    expect(eventAction({ mode: "delayed", transition: "cut", playing: true })).toBe("wait");
    expect(eventAction({ mode: "fixed", transition: "fade", playing: true })).toBe("skip-fade");
    expect(eventAction({ mode: "fixed", transition: "cut", playing: true })).toBe("skip-cut");
  });
});

describe("cola: pistas al principio", () => {
  const q = (id: string): QueueItem => ({ id, file: null, url: null, title: id, artist: "", durationSec: null, source: "local" });
  it("prepend pone las nuevas antes de lo que ya había, en su orden", () => {
    expect(queueReducer([q("a"), q("b")], { type: "prepend", items: [q("x"), q("y")] }).map((i) => i.id)).toEqual(["x", "y", "a", "b"]);
  });
  it("sin pistas no cambia el estado", () => {
    const s = [q("a")];
    expect(queueReducer(s, { type: "prepend", items: [] })).toBe(s);
  });
});
