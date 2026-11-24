import { describe, expect, it } from "vitest";
import { localMediaImage } from "@/lib/local-media-image";

describe("portadas propias optimizables", () => {
  const key = "f9d9423b-82c7-4c5d-a478-5b55a807ce65";
  const site = "https://stereoface.online";
  it("reconoce únicamente medios públicos del sitio", () => {
    expect(localMediaImage(`/media/${key}`, site)).toBe(`/media/${key}`);
    expect(localMediaImage(`${site}/media/${key}`, site)).toBe(`/media/${key}`);
    expect(localMediaImage(`https://otro.example/media/${key}`, site)).toBeNull();
    expect(localMediaImage(`//otro.example/media/${key}`, site)).toBeNull();
    expect(localMediaImage(`${site}/media/${key}?x=1`, site)).toBeNull();
    expect(localMediaImage(`/media/${key}/otra`, site)).toBeNull();
  });
});
