import { describe, expect, it } from "vitest";
import { playerStateOf, YT_ENDED, YT_PLAYING } from "@/ui/studio/youtube-events";

describe("estado del reproductor de YouTube", () => {
  it("lee onStateChange e infoDelivery", () => {
    expect(playerStateOf(JSON.stringify({ event: "onStateChange", info: 0 }))).toBe(YT_ENDED);
    expect(playerStateOf(JSON.stringify({ event: "onStateChange", info: 1, id: 1, channel: "widget" }))).toBe(YT_PLAYING);
    expect(playerStateOf(JSON.stringify({ event: "infoDelivery", info: { playerState: 0, currentTime: 12 } }))).toBe(YT_ENDED);
  });
  it("ignora todo lo demás (otros eventos, texto roto, tipos raros)", () => {
    for (const raw of [JSON.stringify({ event: "infoDelivery", info: { currentTime: 3 } }), JSON.stringify({ event: "onReady" }), JSON.stringify({ event: "onStateChange", info: "0" }), "no es json", "null", "[]", "x".repeat(5000), 42, undefined, null, { event: "onStateChange", info: 0 }]) {
      expect(playerStateOf(raw), String(raw).slice(0, 30)).toBeNull();
    }
  });
});
