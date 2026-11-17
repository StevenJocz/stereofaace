import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Permissions-Policy", () => {
  it("el estudio puede usar el micrófono del propio sitio; la cámara también (para «Cámara en cabina»); el resto sigue bloqueado", async () => {
    const rules = await nextConfig.headers!();
    const policy = rules[0].headers.find((h) => h.key === "Permissions-Policy")!.value;
    expect(policy).toContain("microphone=(self)");
    expect(policy).toContain("camera=(self)");
    expect(policy).toContain("geolocation=()");
  });
});
