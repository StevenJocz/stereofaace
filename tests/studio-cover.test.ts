import { describe, expect, it } from "vitest";
import { parseId3Cover } from "@/ui/studio/engine/cover";

const syncsafe = (n: number) => [(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f];
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

function frame(version: 3 | 4, id: string, body: number[]) {
  return [...ascii(id), ...(version === 4 ? syncsafe(body.length) : be32(body.length)), 0, 0, ...body];
}
function apic(mime: string, data: number[], desc = "") {
  return [0, ...ascii(mime), 0, 3, ...ascii(desc), 0, ...data];
}
function tag(version: 3 | 4, frames: number[][]) {
  const body = frames.flat();
  return new Uint8Array([...ascii("ID3"), version, 0, 0, ...syncsafe(body.length), ...body, 0, 0, 0, 0]);
}

describe("parseId3Cover", () => {
  it("extrae la portada de un ID3v2.3", () => {
    const t = tag(3, [frame(3, "TIT2", [0, ...ascii("Tema")]), frame(3, "APIC", apic("image/jpeg", [1, 2, 3, 4], "portada"))]);
    expect(parseId3Cover(t)).toEqual({ mime: "image/jpeg", data: new Uint8Array([1, 2, 3, 4]) });
  });

  it("extrae la portada de un ID3v2.4 (tamaños syncsafe)", () => {
    const t = tag(4, [frame(4, "APIC", apic("image/png", [9, 8, 7]))]);
    expect(parseId3Cover(t)).toEqual({ mime: "image/png", data: new Uint8Array([9, 8, 7]) });
  });

  it("devuelve null sin etiqueta ID3, sin APIC o con datos truncados", () => {
    expect(parseId3Cover(new Uint8Array([0xff, 0xfb, 0x90, 0x00]))).toBeNull();
    expect(parseId3Cover(tag(3, [frame(3, "TIT2", [0, ...ascii("x")])]))).toBeNull();
    const t = tag(3, [frame(3, "APIC", apic("image/jpeg", [1, 2, 3, 4]))]);
    expect(parseId3Cover(t.slice(0, 20))).toBeNull();
  });

  it("rechaza tipos que no son imagen (evita servir cualquier cosa como portada)", () => {
    const t = tag(3, [frame(3, "APIC", apic("text/html", [60, 98, 62]))]);
    expect(parseId3Cover(t)).toBeNull();
  });

  it("no se cuelga con un tamaño de frame descomunal", () => {
    const body = [...ascii("APIC"), ...be32(0x7fffffff), 0, 0, 0, 0];
    const t = new Uint8Array([...ascii("ID3"), 3, 0, 0, ...syncsafe(body.length), ...body]);
    expect(parseId3Cover(t)).toBeNull();
  });
});
