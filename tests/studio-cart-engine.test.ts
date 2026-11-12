import { describe, expect, it } from "vitest";
import { CART_KIND_LABEL, groupByKind, hotkeyMap, isTypingTarget } from "@/ui/studio/engine/carts";
import type { CartView } from "@/modules/studio/carts";

const c = (id: string, kind: CartView["kind"], position: number, hotkey: string | null = null): CartView => ({
  id,
  name: id,
  kind,
  color: "#c6ff00",
  hotkey,
  durationSec: 3,
  gainDb: 0,
  duck: true,
  position,
});

describe("groupByKind", () => {
  it("agrupa por tipo, ordena por posición e incluye todos los tipos (aunque estén vacíos)", () => {
    const g = groupByKind([c("b", "jingle", 2), c("a", "jingle", 1), c("p", "promo", 0)]);
    expect(g.jingle.map((x) => x.id)).toEqual(["a", "b"]);
    expect(g.promo.map((x) => x.id)).toEqual(["p"]);
    expect(g.sweeper).toEqual([]);
    expect(Object.keys(g).sort()).toEqual(Object.keys(CART_KIND_LABEL).sort());
  });
});

describe("hotkeyMap", () => {
  it("mapea teclas en minúscula, ignora carts sin atajo y conserva el primero si hay duplicados", () => {
    const m = hotkeyMap([c("1", "jingle", 0, "Q"), c("2", "promo", 1, "q"), c("3", "promo", 2, null), c("4", "effect", 3, "7")]);
    expect(m.get("q")).toBe("1");
    expect(m.get("7")).toBe("4");
    expect(m.size).toBe(2);
  });
});

describe("isTypingTarget", () => {
  it("detecta campos de texto y elementos editables", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  it("un div, un botón o null no lo son", () => {
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
