import { describe, expect, it } from "vitest";
import { formatAgendaDate } from "@/lib/time";
import { fromBogotaInput, toBogotaInput } from "@/ui/admin/countries";

describe("hora de Bogotá en los formularios", () => {
  it("interpreta datetime-local como UTC−5", () => {
    expect(new Date(fromBogotaInput("2026-12-05T21:00")!).toISOString()).toBe("2026-12-06T02:00:00.000Z");
  });
  it("devuelve undefined si el campo está vacío", () => {
    expect(fromBogotaInput(undefined)).toBeUndefined();
    expect(fromBogotaInput("")).toBeUndefined();
  });
  it("ida y vuelta: lo que se escribe es lo que se vuelve a ver", () => {
    const d = new Date(fromBogotaInput("2026-12-05T21:00")!);
    expect(toBogotaInput(d)).toBe("2026-12-05T21:00");
  });

  it("la ficha de agenda muestra el día en Bogotá, no en UTC (un evento a las 21:00 no salta al día siguiente)", () => {
    expect(formatAgendaDate(new Date("2026-12-06T02:00:00.000Z"))).toBe("DIC 05");
    expect(formatAgendaDate(new Date("2026-12-05T15:00:00.000Z"))).toBe("DIC 05");
    expect(formatAgendaDate(new Date("2026-12-06T05:00:00.000Z"))).toBe("DIC 06");
  });
});
