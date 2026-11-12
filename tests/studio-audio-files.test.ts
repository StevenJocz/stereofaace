import { describe, expect, it } from "vitest";
import { isAudioFile, makeItems, parseTrackName } from "@/ui/studio/engine/audio-files";

const f = (name: string, type: string) => new File(["x"], name, { type });

describe("isAudioFile", () => {
  it("acepta audio por MIME o por extensión", () => {
    expect(isAudioFile({ name: "a.mp3", type: "audio/mpeg" })).toBe(true);
    expect(isAudioFile({ name: "a.flac", type: "" })).toBe(true);
    expect(isAudioFile({ name: "A.WAV", type: "" })).toBe(true);
    expect(isAudioFile({ name: "a.m4a", type: "audio/mp4" })).toBe(true);
  });

  it("rechaza imágenes y documentos", () => {
    expect(isAudioFile({ name: "foto.png", type: "image/png" })).toBe(false);
    expect(isAudioFile({ name: "doc.pdf", type: "application/pdf" })).toBe(false);
    expect(isAudioFile({ name: "sinextension", type: "" })).toBe(false);
  });
});

describe("parseTrackName", () => {
  it("separa «Artista - Título.ext»", () => {
    expect(parseTrackName("Of Monsters and Men - Little Talks.mp3")).toEqual({
      artist: "Of Monsters and Men",
      title: "Little Talks",
    });
  });

  it("sin guion deja el artista vacío y quita la extensión", () => {
    expect(parseTrackName("01 intro.wav")).toEqual({ artist: "", title: "01 intro" });
  });

  it("solo separa en el primer « - »", () => {
    expect(parseTrackName("A - B - C.mp3")).toEqual({ artist: "A", title: "B - C" });
  });
});

describe("makeItems", () => {
  it("rechaza lo que no es audio y lo informa por nombre", () => {
    const { items, rejected } = makeItems([f("foto.png", "image/png"), f("A - B.mp3", "audio/mpeg")]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "B", artist: "A", source: "local", url: null, durationSec: null });
    expect(rejected).toEqual(["foto.png"]);
  });

  it("el mismo archivo dos veces entra dos veces con ids distintos", () => {
    const file = f("x.mp3", "audio/mpeg");
    const { items } = makeItems([file, file]);
    expect(items).toHaveLength(2);
    expect(items[0].id).not.toBe(items[1].id);
  });
});
