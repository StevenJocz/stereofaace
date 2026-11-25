import { describe, expect, it } from "vitest";
import { DEFAULT_PTT, parsePtt, pttLabel, validPttCode } from "@/ui/studio/engine/ptt";

describe("tecla para hablar", () => {
  it("acepta letras, números, F1–F12, espacio y símbolos", () => {
    for (const c of ["KeyV", "KeyÑ".replace("Ñ", "N"), "Digit5", "F8", "F12", "Space", "Numpad1", "Backquote", "ArrowUp", "Slash"]) expect(validPttCode(c)).toBe(true);
  });
  it("rechaza modificadoras y teclas con función propia", () => {
    for (const c of ["ShiftLeft", "ControlRight", "AltLeft", "MetaLeft", "Escape", "Tab", "Enter", "Backspace", "CapsLock", "Delete", "PageUp", "", null, undefined, "Unidentified", "KeyVV"]) expect(validPttCode(c as string)).toBe(false);
  });
  it("lo guardado inválido vuelve a la V", () => {
    expect(parsePtt("F8")).toBe("F8");
    expect(parsePtt("Escape")).toBe(DEFAULT_PTT);
    expect(parsePtt(null)).toBe("KeyV");
  });
  it("se muestra legible", () => {
    expect(pttLabel("KeyV")).toBe("V");
    expect(pttLabel("Digit3")).toBe("3");
    expect(pttLabel("Space")).toBe("Espacio");
    expect(pttLabel("F8")).toBe("F8");
    expect(pttLabel("Numpad4")).toBe("Núm. 4");
    expect(pttLabel("ArrowLeft")).toBe("←");
  });
});
