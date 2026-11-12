import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Permissions-Policy", () => {
  it("el estudio puede usar el micrófono del propio sitio; cámara y el resto siguen bloqueados", async () => {
    const rules = await nextConfig.headers!();
    const policy = rules[0].headers.find((h) => h.key === "Permissions-Policy")!.value;
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("camera=()");
    expect(policy).toContain("geolocation=()");
  });
});
