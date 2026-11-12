import { describe, expect, it } from "vitest";
import { bogotaParts, currentOccurrence, occurrencesBetween, type Slot } from "@/modules/schedule/occurrences";

const weekly = (id: string, programId: string, weekday: number, start: string, end: string): Slot => ({ id, programId, kind: "weekly", weekday, date: null, start, end });
const once = (id: string, programId: string, date: string, start: string, end: string): Slot => ({ id, programId, kind: "once", weekday: null, date, start, end });
const iso = (d: Date) => d.toISOString();

// 2026-11-16 es lunes. Bogotá = UTC−5 todo el año.
describe("bogotaParts", () => {
  it("convierte a fecha, día de la semana y minutos de Bogotá", () => {
    expect(bogotaParts(new Date("2026-11-17T04:30:00Z"))).toEqual({ date: "2026-11-16", weekday: 1, minutes: 23 * 60 + 30 });
    expect(bogotaParts(new Date("2026-11-16T05:00:00Z"))).toEqual({ date: "2026-11-16", weekday: 1, minutes: 0 });
  });
});

describe("occurrencesBetween", () => {
  it("expande un tramo semanal a la hora de Bogotá (lunes 18:00–20:00 = 23:00Z–01:00Z)", () => {
    const o = occurrencesBetween([weekly("s1", "p1", 1, "18:00", "20:00")], new Date("2026-11-16T00:00:00Z"), new Date("2026-11-18T00:00:00Z"));
    expect(o.map((x) => [iso(x.startsAt), iso(x.endsAt), x.programId])).toEqual([["2026-11-16T23:00:00.000Z", "2026-11-17T01:00:00.000Z", "p1"]]);
  });

  it("un tramo que cruza la medianoche se expande a dos días y «ahora» lo detecta a las 00:30", () => {
    const slots = [weekly("s1", "p1", 5, "22:00", "02:00")]; // viernes 22:00 → sábado 02:00
    const o = occurrencesBetween(slots, new Date("2026-11-20T00:00:00Z"), new Date("2026-11-22T00:00:00Z"));
    expect(o.map((x) => [iso(x.startsAt), iso(x.endsAt)])).toEqual([["2026-11-21T03:00:00.000Z", "2026-11-21T07:00:00.000Z"]]);
    const now = currentOccurrence(slots, new Date("2026-11-21T05:30:00Z")); // sábado 00:30 Bogotá
    expect(now?.programId).toBe("p1");
  });

  it("incluye una ocurrencia que empezó antes del rango y termina dentro", () => {
    const slots = [weekly("s1", "p1", 1, "18:00", "20:00")];
    const o = occurrencesBetween(slots, new Date("2026-11-17T00:00:00Z"), new Date("2026-11-17T02:00:00Z"));
    expect(o).toHaveLength(1);
    expect(iso(o[0].startsAt)).toBe("2026-11-16T23:00:00.000Z");
  });

  it("un puntual sustituye al semanal en el intervalo en conflicto (el semanal queda partido)", () => {
    const slots = [weekly("s1", "semanal", 2, "13:00", "16:00"), once("s2", "puntual", "2026-11-17", "14:00", "15:00")];
    const o = occurrencesBetween(slots, new Date("2026-11-17T12:00:00Z"), new Date("2026-11-18T00:00:00Z"));
    expect(o.map((x) => [x.programId, iso(x.startsAt), iso(x.endsAt)])).toEqual([
      ["semanal", "2026-11-17T18:00:00.000Z", "2026-11-17T19:00:00.000Z"],
      ["puntual", "2026-11-17T19:00:00.000Z", "2026-11-17T20:00:00.000Z"],
      ["semanal", "2026-11-17T20:00:00.000Z", "2026-11-17T21:00:00.000Z"],
    ]);
  });

  it("entre dos semanales solapados gana el que empieza más tarde", () => {
    const slots = [weekly("a", "largo", 3, "10:00", "14:00"), weekly("b", "corto", 3, "12:00", "13:00")];
    const o = occurrencesBetween(slots, new Date("2026-11-18T00:00:00Z"), new Date("2026-11-19T00:00:00Z"));
    expect(o.map((x) => x.programId)).toEqual(["largo", "corto", "largo"]);
  });

  it("sin tramos, con rango invertido o con tramos vacíos devuelve []", () => {
    expect(occurrencesBetween([], new Date("2026-11-16T00:00:00Z"), new Date("2026-11-20T00:00:00Z"))).toEqual([]);
    expect(occurrencesBetween([weekly("s", "p", 1, "18:00", "20:00")], new Date("2026-11-20T00:00:00Z"), new Date("2026-11-16T00:00:00Z"))).toEqual([]);
    expect(occurrencesBetween([weekly("s", "p", 1, "18:00", "18:00")], new Date("2026-11-16T00:00:00Z"), new Date("2026-11-20T00:00:00Z"))).toEqual([]);
  });

  it("ordena por hora de inicio y no repite ocurrencias", () => {
    const slots = [weekly("s2", "b", 1, "20:00", "21:00"), weekly("s1", "a", 1, "08:00", "09:00")];
    const o = occurrencesBetween(slots, new Date("2026-11-16T00:00:00Z"), new Date("2026-11-17T12:00:00Z"));
    expect(o.map((x) => x.programId)).toEqual(["a", "b"]);
  });
});

describe("currentOccurrence", () => {
  it("devuelve null fuera de cualquier tramo y el tramo vigente dentro", () => {
    const slots = [weekly("s1", "p1", 1, "18:00", "20:00")];
    expect(currentOccurrence(slots, new Date("2026-11-16T21:30:00Z"))).toBeNull(); // 16:30 Bogotá
    expect(currentOccurrence(slots, new Date("2026-11-16T23:30:00Z"))?.programId).toBe("p1"); // 18:30
    expect(currentOccurrence(slots, new Date("2026-11-17T01:00:00Z"))).toBeNull(); // 20:00 exacto: ya terminó
  });
});
