import { describe, expect, it } from "vitest";
import { queueReducer, type QueueItem } from "@/ui/studio/engine/queue";

const item = (id: string, title = id): QueueItem => ({
  id,
  file: null,
  url: null,
  title,
  artist: "",
  durationSec: null,
  source: "local",
});

describe("queueReducer", () => {
  it("add agrega al final y en orden", () => {
    const s = queueReducer([item("a")], { type: "add", items: [item("b"), item("c")] });
    expect(s.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("move reordena de la posición 0 a la 2", () => {
    const s = queueReducer([item("a"), item("b"), item("c")], { type: "move", from: 0, to: 2 });
    expect(s.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("remove de un id inexistente no cambia nada", () => {
    const s = [item("a"), item("b")];
    expect(queueReducer(s, { type: "remove", id: "zzz" })).toEqual(s);
  });

  it("remove quita solo el id pedido", () => {
    const s = queueReducer([item("a"), item("b")], { type: "remove", id: "a" });
    expect(s.map((i) => i.id)).toEqual(["b"]);
  });

  it("shift quita el primero y sobre una cola vacía devuelve []", () => {
    expect(queueReducer([item("a"), item("b")], { type: "shift" }).map((i) => i.id)).toEqual(["b"]);
    expect(queueReducer([], { type: "shift" })).toEqual([]);
  });

  it("clear vacía la cola", () => {
    expect(queueReducer([item("a")], { type: "clear" })).toEqual([]);
  });

  it("move con índices fuera de rango no rompe la cola", () => {
    const s = [item("a"), item("b")];
    expect(queueReducer(s, { type: "move", from: 5, to: 0 })).toEqual(s);
  });
});
