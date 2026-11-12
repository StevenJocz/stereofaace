import { describe, expect, it } from "vitest";
import { splitHeroTitle } from "@/ui/hero-copy";

describe("splitHeroTitle", () => {
  it("conserva todas las palabras y solo corta entre palabras", () => {
    expect(splitHeroTitle("Till Lindemann llega a Bogotá", 20)).toEqual(["Till Lindemann llega", "a Bogotá"]);
  });

  it("deja intacta una palabra que supera el límite", () => {
    expect(splitHeroTitle("Una palabra excepcionalmentelarga", 12)).toEqual(["Una palabra", "excepcionalmentelarga"]);
  });
});
