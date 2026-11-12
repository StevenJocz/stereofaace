import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("hero navigation", () => {
  it("uses Next Link for the article CTA instead of a native page reload", async () => {
    const source = await readFile(path.join(process.cwd(), "src", "ui", "HeroSlider.tsx"), "utf8");

    expect(source).toContain('import Link from "next/link"');
    expect(source).toContain('<Link href={sl.href} className="btn">');
    expect(source).not.toContain('<a href={sl.href} className="btn">');
  });

  it("derives hero lines from the complete article title and keeps an editorial phrase", async () => {
    const source = await readFile(path.join(process.cwd(), "src", "app", "(public)", "page.tsx"), "utf8");

    expect(source).toContain("splitHeroTitle(h.title)");
    expect(source).toContain("phrase: config.phrase");
  });
});
