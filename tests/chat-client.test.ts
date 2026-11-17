import { describe, expect, it } from "vitest";
import { mergeMessages } from "@/ui/chat/chat-client";
import { EMOJI_GROUPS } from "@/ui/chat/emojis";

const m = (id: number) => ({ id, kind: "message" as const, nickname: "A", body: `m${id}`, artist: null, note: null, gif: null, at: "2026-11-17T00:00:00Z", mine: false });

describe("mergeMessages", () => {
  it("suma lo nuevo en orden y sin repetir", () => {
    expect(mergeMessages([m(1), m(2)], [m(2), m(3)]).map((x) => x.id)).toEqual([1, 2, 3]);
  });
  it("sin nada nuevo devuelve la misma lista", () => {
    const a = [m(1)];
    expect(mergeMessages(a, [])).toBe(a);
  });
  it("conserva solo los últimos N", () => {
    const many = Array.from({ length: 10 }, (_, i) => m(i + 1));
    expect(mergeMessages([], many, 4).map((x) => x.id)).toEqual([7, 8, 9, 10]);
  });
});

describe("emojis", () => {
  it("hay varios grupos con emojis sin repetir dentro de cada grupo", () => {
    expect(EMOJI_GROUPS.length).toBeGreaterThanOrEqual(4);
    for (const g of EMOJI_GROUPS) expect(new Set(g.items).size).toBe(g.items.length);
  });
});
