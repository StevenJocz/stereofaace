import { describe, expect, it } from "vitest";
import { MAX_AUDIO_BYTES, validateAudioUpload } from "@/modules/studio/audio-validation";

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const file = (bytes: number[], name: string, type = "audio/mpeg") => new File([new Uint8Array(bytes)], name, { type });

describe("validateAudioUpload", () => {
  it("acepta MP3 con etiqueta ID3 y con sincronía MPEG", async () => {
    const id3 = await validateAudioUpload(file([...ascii("ID3"), 3, 0, 0, 0, 0, 0, 0, 1, 2, 3], "a.mp3"));
    expect(id3).toMatchObject({ ok: true, mime: "audio/mpeg", extension: "mp3" });
    const sync = await validateAudioUpload(file([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4], "b.mp3"));
    expect(sync).toMatchObject({ ok: true, mime: "audio/mpeg" });
  });

  it("acepta WAV, OGG, FLAC y M4A por su firma", async () => {
    expect(await validateAudioUpload(file([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE"), 1], "a.wav", "audio/wav"))).toMatchObject({ ok: true, mime: "audio/wav", extension: "wav" });
    expect(await validateAudioUpload(file([...ascii("OggS"), 0, 2, 0, 0, 1], "a.ogg", "audio/ogg"))).toMatchObject({ ok: true, mime: "audio/ogg", extension: "ogg" });
    expect(await validateAudioUpload(file([...ascii("fLaC"), 0, 0, 0, 34, 1], "a.flac", "audio/flac"))).toMatchObject({ ok: true, mime: "audio/flac", extension: "flac" });
    expect(await validateAudioUpload(file([0, 0, 0, 24, ...ascii("ftypM4A "), 0, 0, 0, 0, 1], "a.m4a", "audio/mp4"))).toMatchObject({ ok: true, mime: "audio/mp4", extension: "m4a" });
  });

  it("rechaza por contenido un PNG renombrado a .mp3 (aunque declare audio/mpeg)", async () => {
    const r = await validateAudioUpload(file([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, 1, 2], "falso.mp3", "audio/mpeg"));
    expect(r).toMatchObject({ ok: false });
  });

  it("rechaza archivos vacíos y demasiado grandes", async () => {
    expect(await validateAudioUpload(file([], "vacio.mp3"))).toMatchObject({ ok: false });
    const big = new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], "grande.wav", { type: "audio/wav" });
    expect(await validateAudioUpload(big)).toMatchObject({ ok: false });
  });

  it("MAX_AUDIO_BYTES es 25 MB", () => {
    expect(MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024);
  });
});
