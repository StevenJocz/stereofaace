import { describe, expect, it } from "vitest";
import { addDays, formatRange, groupByDay, monthGrid, rangeFor, todayBogota } from "@/ui/radio/schedule-view";

const item = (name: string, startsAt: string, endsAt: string) => ({ program: { name }, startsAt, endsAt });

describe("formatRange", () => {
  it("muestra HH:MM–HH:MM en hora de Bogotá", () => {
    expect(formatRange("2026-11-16T23:00:00.000Z", "2026-11-17T01:00:00.000Z")).toBe("18:00–20:00");
    expect(formatRange("2026-11-17T04:30:00.000Z", "2026-11-17T06:00:00.000Z")).toBe("23:30–01:00");
  });
});

describe("groupByDay", () => {
  it("agrupa por día de Bogotá (23:30 local cae en su día aunque en UTC sea el siguiente) y ordena", () => {
    const g = groupByDay([item("Noche", "2026-11-17T04:30:00.000Z", "2026-11-17T06:00:00.000Z"), item("Mañana", "2026-11-16T11:00:00.000Z", "2026-11-16T15:00:00.000Z"), item("Lunes tarde", "2026-11-16T20:00:00.000Z", "2026-11-16T22:00:00.000Z")]);
    expect(g.map((d) => [d.date, d.items.map((i) => i.program.name)])).toEqual([["2026-11-16", ["Mañana", "Lunes tarde", "Noche"]]]);
  });
  it("separa días distintos y etiqueta el día en español", () => {
    const g = groupByDay([item("A", "2026-11-16T15:00:00.000Z", "2026-11-16T16:00:00.000Z"), item("B", "2026-11-17T15:00:00.000Z", "2026-11-17T16:00:00.000Z")]);
    expect(g.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(g[0].label.toLowerCase()).toContain("lunes");
    expect(g[0].label).toContain("16");
  });
  it("sin items devuelve []", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("monthGrid", () => {
  it("noviembre de 2026 empieza en lunes 26 de octubre y son semanas completas", () => {
    const g = monthGrid(2026, 11);
    expect(g[0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(g.length % 7).toBe(0);
    expect(g.filter((c) => c.inMonth)).toHaveLength(30);
    expect(g.find((c) => c.date === "2026-11-01")?.inMonth).toBe(true);
  });
  it("un mes que ya empieza en lunes no agrega días de relleno antes (febrero 2027)", () => {
    expect(monthGrid(2027, 2)[0]).toEqual({ date: "2027-02-01", inMonth: true });
  });
});

describe("addDays / rangeFor / todayBogota", () => {
  it("suma días a una fecha local y cruza el mes", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("rangeFor: hoy es un solo día, semana va de lunes a domingo, mes cubre la cuadrícula completa", () => {
    expect(rangeFor("today", "2026-11-18")).toEqual({ from: "2026-11-18", to: "2026-11-18" });
    expect(rangeFor("week", "2026-11-18")).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    const m = rangeFor("month", "2026-11-18");
    expect(m).toEqual({ from: "2026-10-26", to: "2026-12-06" });
  });
  it("todayBogota usa la fecha local de Bogotá", () => {
    expect(todayBogota(new Date("2026-11-17T04:00:00Z"))).toBe("2026-11-16");
  });
});
