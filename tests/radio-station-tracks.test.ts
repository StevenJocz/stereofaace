import { describe, expect, it } from "vitest";
import { isGenericArt, previousTitles } from "@/ui/radio/StationTracks";

describe("isGenericArt", () => {
  it("reconoce la carátula genérica de AzuraCast y la ausencia de carátula", () => {
    expect(isGenericArt("https://radio.stereoface.online/static/vite_dist/assets/generic_song-7JSFKOXX.jpg")).toBe(true);
    expect(isGenericArt(null)).toBe(true);
    expect(isGenericArt("https://radio.stereoface.online/api/station/stereo_face/art/abc.jpg")).toBe(false);
  });
});

describe("previousTitles", () => {
  it("quita la que suena, las vacías y las repetidas seguidas", () => {
    const now = { title: "Uplifting Life Trance Episode 245" };
    const h = [{ title: "Bravado" }, { title: "uplifting life trance episode 245" }, { title: "Bravado" }, { title: "  " }, { title: "Otra" }, { title: "Otra" }];
    expect(previousTitles(now, h)).toEqual(["Bravado", "Otra"]);
  });
});
