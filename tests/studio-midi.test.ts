import { describe, expect, it } from "vitest";
import { MIDI_ACTIONS, actionById, applyLearn, bindKey, describeKey, isPress, keyOf, learnable, parseMidi, parseStoredMap, removeBinding, resolveMidi, type MidiMap } from "@/ui/studio/engine/midi";

describe("parseMidi", () => {
  it("notas encendidas y apagadas, y controles", () => {
    expect(parseMidi([0x90, 36, 100])).toEqual({ kind: "note", channel: 0, number: 36, value: 100 });
    expect(parseMidi([0x93, 60, 0])).toEqual({ kind: "note", channel: 3, number: 60, value: 0 });
    expect(parseMidi([0x80, 36, 64])).toEqual({ kind: "note", channel: 0, number: 36, value: 0 }); // nota apagada = soltar
    expect(parseMidi([0xb1, 7, 127])).toEqual({ kind: "cc", channel: 1, number: 7, value: 127 });
  });
  it("ignora lo demás (reloj, cambio de programa, pitch, mensajes cortos o vacíos)", () => {
    expect(parseMidi([0xf8])).toBeNull();
    expect(parseMidi([0xc0, 5, 0])).toBeNull();
    expect(parseMidi([0xe0, 0, 64])).toBeNull();
    expect(parseMidi([0x90, 36])).toBeNull();
    expect(parseMidi(null)).toBeNull();
    expect(parseMidi(undefined)).toBeNull();
  });
  it("acota los datos a 7 bits", () => {
    expect(parseMidi([0x90, 0xff, 0xff])).toEqual({ kind: "note", channel: 0, number: 127, value: 127 });
  });
});

describe("pulsar y soltar", () => {
  it("nota con velocidad = pulsar; nota con 0 = soltar; control ≥ 64 = pulsar", () => {
    expect(isPress({ kind: "note", channel: 0, number: 1, value: 1 })).toBe(true);
    expect(isPress({ kind: "note", channel: 0, number: 1, value: 0 })).toBe(false);
    expect(isPress({ kind: "cc", channel: 0, number: 1, value: 127 })).toBe(true);
    expect(isPress({ kind: "cc", channel: 0, number: 1, value: 63 })).toBe(false);
  });
});

describe("mapa y aprendizaje", () => {
  const play = actionById("play")!;
  const vol = actionById("vol-master")!;
  it("los botones aprenden notas y controles al pulsar; los deslizadores solo controles", () => {
    expect(learnable(play, { kind: "note", channel: 0, number: 36, value: 90 })).toBe(true);
    expect(learnable(play, { kind: "note", channel: 0, number: 36, value: 0 })).toBe(false); // soltar no vincula
    expect(learnable(play, { kind: "cc", channel: 0, number: 20, value: 127 })).toBe(true);
    expect(learnable(play, { kind: "cc", channel: 0, number: 20, value: 0 })).toBe(false);
    expect(learnable(vol, { kind: "cc", channel: 0, number: 7, value: 12 })).toBe(true);
    expect(learnable(vol, { kind: "note", channel: 0, number: 36, value: 100 })).toBe(false);
  });
  it("cada acción tiene un solo control y cada control una sola acción", () => {
    let map: MidiMap = {};
    map = applyLearn(map, "play", { kind: "note", channel: 0, number: 36, value: 100 });
    map = applyLearn(map, "play", { kind: "note", channel: 0, number: 40, value: 100 }); // cambia el control de «play»
    expect(map).toEqual({ "note:0:40": "play" });
    map = applyLearn(map, "stop", { kind: "note", channel: 0, number: 40, value: 100 }); // otro botón reclama ese control
    expect(map).toEqual({ "note:0:40": "stop" });
    expect(keyOf(map, "stop")).toBe("note:0:40");
    expect(keyOf(map, "play")).toBeNull();
    expect(removeBinding(map, "stop")).toEqual({});
  });
  it("describe el control para la pantalla (canal desde 1)", () => {
    expect(describeKey("note:0:36")).toBe("Nota 36 · canal 1");
    expect(describeKey("cc:8:7")).toBe("Control 7 · canal 9");
    expect(describeKey("raro")).toBe("raro");
    expect(bindKey({ kind: "cc", channel: 2, number: 9 })).toBe("cc:2:9");
  });
});

describe("resolver un mensaje", () => {
  const map: MidiMap = { "note:0:36": "play", "cc:0:7": "vol-master", "note:0:50": "mic-ptt" };
  it("botón: pulsar y soltar; deslizador: valor de 0 a 1", () => {
    expect(resolveMidi(map, { kind: "note", channel: 0, number: 36, value: 100 })).toMatchObject({ action: "play", kind: "button", press: true });
    expect(resolveMidi(map, { kind: "note", channel: 0, number: 36, value: 0 })).toMatchObject({ action: "play", press: false });
    expect(resolveMidi(map, { kind: "cc", channel: 0, number: 7, value: 127 })).toEqual({ action: "vol-master", kind: "fader", press: false, value: 1 });
    expect(resolveMidi(map, { kind: "cc", channel: 0, number: 7, value: 0 })?.value).toBe(0);
    expect(resolveMidi(map, { kind: "cc", channel: 0, number: 7, value: 64 })?.value).toBeCloseTo(0.504, 2);
  });
  it("«mantener» devuelve pulsar y soltar para abrir y cerrar el micrófono", () => {
    expect(resolveMidi(map, { kind: "note", channel: 0, number: 50, value: 100 })).toMatchObject({ kind: "hold", press: true });
    expect(resolveMidi(map, { kind: "note", channel: 0, number: 50, value: 0 })).toMatchObject({ kind: "hold", press: false });
  });
  it("lo que no está vinculado no hace nada; un deslizador mapeado a una nota tampoco", () => {
    expect(resolveMidi(map, { kind: "note", channel: 1, number: 36, value: 100 })).toBeNull();
    expect(resolveMidi({ "note:0:9": "vol-master" }, { kind: "note", channel: 0, number: 9, value: 100 })).toBeNull();
    expect(resolveMidi({ "note:0:9": "no-existe" }, { kind: "note", channel: 0, number: 9, value: 100 })).toBeNull();
  });
});

describe("mapa guardado", () => {
  it("descarta claves raras, acciones que no existen y acciones repetidas", () => {
    const raw = JSON.stringify({ "note:0:36": "play", "cc:0:7": "vol-master", "x:1:2": "stop", "note:0:5": "no-existe", "note:0:6": "play", "note:0:7": 5 });
    expect(parseStoredMap(raw)).toEqual({ "note:0:36": "play", "cc:0:7": "vol-master" });
  });
  it("tolera texto roto o vacío", () => {
    expect(parseStoredMap(null)).toEqual({});
    expect(parseStoredMap("no es json")).toEqual({});
    expect(parseStoredMap("[1,2]")).toEqual({});
  });
});

describe("acciones", () => {
  it("hay jingles del 1 al 9 y los ids no se repiten", () => {
    const ids = MIDI_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i <= 9; i++) expect(ids).toContain(`jingle-${i}`);
  });
});
