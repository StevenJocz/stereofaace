import { describe, expect, it } from "vitest";
import { azToQueueItem, parseDragItems } from "@/ui/studio/engine/library";

const f = { id: "7", path: "x/a.mp3", title: "Tema", artist: "Banda", durationSec: 120 };

describe("azToQueueItem", () => {
  it("apunta al proxy del estudio y no lleva archivo local", () => {
    const it = azToQueueItem(f);
    expect(it).toMatchObject({
      file: null,
      url: "/api/studio/file/7",
      title: "Tema",
      artist: "Banda",
      durationSec: 120,
      source: "azuracast",
    });
  });

  it("cada conversión recibe un id nuevo (la misma pista puede entrar dos veces)", () => {
    expect(azToQueueItem(f).id).not.toBe(azToQueueItem(f).id);
  });
});

describe("parseDragItems", () => {
  it("lee un arreglo de pistas válido", () => {
    expect(parseDragItems(JSON.stringify([f]))).toEqual([f]);
  });

  it("ignora basura, JSON roto y elementos sin id numérico", () => {
    expect(parseDragItems("")).toEqual([]);
    expect(parseDragItems("{no json")).toEqual([]);
    expect(parseDragItems(JSON.stringify([{ id: "../x", title: "t" }, f]))).toEqual([f]);
    expect(parseDragItems(JSON.stringify({ id: "7" }))).toEqual([]);
  });
});
