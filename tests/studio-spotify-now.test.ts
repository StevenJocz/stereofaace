import { describe, expect, it } from "vitest";
import { parseCurrentlyPlaying } from "@/modules/studio/spotify-now";

const ID = "4uLU6hMCjMI75M1A2tKUQC";

describe("parseCurrentlyPlaying", () => {
  it("lee título y artistas de una canción", () => {
    const now = parseCurrentlyPlaying({ is_playing: true, currently_playing_type: "track", item: { id: ID, name: "F Extraño 267", artists: [{ name: "Manuel Le Saux" }, { name: "Otra Persona" }] } });
    expect(now).toEqual({ playing: true, ad: false, track: { id: ID, title: "F Extraño 267", artist: "Manuel Le Saux, Otra Persona", kind: "track" } });
  });

  it("en pausa conserva la canción pero lo indica", () => {
    expect(parseCurrentlyPlaying({ is_playing: false, currently_playing_type: "track", item: { id: ID, name: "X", artists: [] } })?.playing).toBe(false);
  });

  it("un episodio usa el nombre del programa como autor", () => {
    const now = parseCurrentlyPlaying({ is_playing: true, currently_playing_type: "episode", item: { id: ID, name: "Capítulo 3", show: { name: "Mi podcast" } } });
    expect(now?.track).toEqual({ id: ID, title: "Capítulo 3", artist: "Mi podcast", kind: "episode" });
  });

  it("un anuncio no es una canción", () => {
    expect(parseCurrentlyPlaying({ is_playing: true, currently_playing_type: "ad", item: null })).toEqual({ playing: true, ad: true, track: null });
  });

  it("limpia caracteres de control y descarta ids raros", () => {
    const now = parseCurrentlyPlaying({ is_playing: true, currently_playing_type: "track", item: { id: "<script>", name: "A\u0000B\nC", artists: [{ name: " Dúo " }] } });
    expect(now?.track).toEqual({ id: null, title: "A B C", artist: "Dúo", kind: "track" });
  });

  it("devuelve null con respuestas vacías o de otro formato", () => {
    for (const raw of [null, undefined, "x", 3, [], {}, { item: {} }, { item: { name: "" } }]) expect(parseCurrentlyPlaying(raw)).toBeNull();
  });
});
