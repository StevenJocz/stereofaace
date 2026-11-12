import { describe, expect, it } from "vitest";
import { withoutValues, type FormState } from "@/lib/admin/form";

describe("withoutValues", () => {
  it("quita los campos secretos de values y conserva el resto", () => {
    const s: FormState = { message: "x", values: { baseUrl: "https://a.b", apiKey: "SECRETO" }, nonce: 1 };
    const out = withoutValues(s, ["apiKey"]);
    expect(out?.values).toEqual({ baseUrl: "https://a.b" });
    expect(JSON.stringify(out)).not.toContain("SECRETO");
  });
  it("deja pasar un estado sin values o nulo", () => {
    expect(withoutValues(null, ["apiKey"])).toBeNull();
    expect(withoutValues({ ok: true, message: "ok", nonce: 1 }, ["apiKey"])).toEqual({ ok: true, message: "ok", nonce: 1 });
  });
});
