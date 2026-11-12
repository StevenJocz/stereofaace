# Hero Copy and Continuous Radio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every featured article title, show its editorial phrase, and navigate from the hero without restarting the radio.

**Architecture:** A small pure text helper will split a title on word boundaries for the existing animated hero lines. The public home page will always derive those lines from `article.title`; the hero configuration provides only presentation metadata and an optional editorial phrase. The client hero replaces its native anchor with Next.js `Link` so the root radio provider remains mounted.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-10-hero-full-title-design.md`

## Global Constraints

- Preserve the article title, dek, and body exactly.
- Do not activate or alter radio stations.
- The Till Lindemann phrase is editorial data: `«Bogotá arde: Till Lindemann llega para encender la escena.»`.
- The editor selection copy is: `«La música no solo suena: abre grietas, reúne cuerpos y cambia la noche.»`.

## Review Focus

- Titles shorter than the line limit remain one intact line; Task 1 tests this.
- Long titles retain every word in order; Task 1 tests this.
- A single word longer than the limit remains intact instead of being cut; Task 1 tests this.
- Existing hero blocks without a phrase continue rendering their dek; Task 2 typechecks and build-checks this.
- Hero article navigation is client-side; Task 3 verifies `Link` replaces the native anchor in the rendered component source.

---

### Task 1: Title line helper

**Files:**
- Create: `src/ui/hero-copy.ts`
- Create: `tests/hero-copy.test.ts`

**Interfaces:**
- Produces: `splitHeroTitle(title: string, maxCharacters?: number): string[]`

- [ ] **Step 1: Write the failing test**

```ts
expect(splitHeroTitle("Till Lindemann llega a Bogotá", 18)).toEqual([
  "Till Lindemann llega",
  "a Bogotá",
]);
expect(splitHeroTitle("Una palabra excepcionalmentelarga", 12)).toEqual([
  "Una palabra",
  "excepcionalmentelarga",
]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hero-copy.test.ts`
Expected: FAIL because `src/ui/hero-copy.ts` does not exist.

- [ ] **Step 3: Implement `splitHeroTitle(title: string, maxCharacters = 28): string[]` in `src/ui/hero-copy.ts`**

Accumulate whole whitespace-separated words up to the limit; begin a new line before adding a word that would exceed it. Return a single non-empty title as one line even when that word exceeds the limit.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/hero-copy.test.ts`
Expected: PASS.

### Task 2: Connect the complete title and editorial phrase

**Files:**
- Modify: `src/modules/content/schema.ts:163-173`
- Modify: `src/app/(public)/page.tsx:1-130, 535-548`
- Modify: `src/ui/HeroSlider.tsx:16-35, 294-308`

**Interfaces:**
- Consumes: `splitHeroTitle(title: string, maxCharacters?: number): string[]`
- Produces: `HeroSlideView.phrase?: string` and `HeroConfig.phrase?: string`

- [ ] **Step 1: Write the failing test**

```ts
expect(splitHeroTitle("The complete headline survives", 12).join(" ")).toBe(
  "The complete headline survives",
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hero-copy.test.ts`
Expected: FAIL until the helper exists.

- [ ] **Step 3: Extend the hero types and home mapping**

Add optional `phrase` to `HeroConfig` and `HeroSlideView`. In `heroView`, use `splitHeroTitle(h.title)` rather than `config.lines`, choose the final line as the default accent, and pass `config.phrase`. Render `phrase` between the heading and dek only when present. Replace the selection placeholder and delete the fictitious attribution.

- [ ] **Step 4: Run focused test and typecheck**

Run: `npm test -- tests/hero-copy.test.ts && npm run typecheck`
Expected: PASS and TypeScript exits 0.

### Task 3: Keep the radio playing across hero navigation

**Files:**
- Modify: `src/ui/HeroSlider.tsx:1, 303-305`

**Interfaces:**
- Consumes: `next/link` `Link` component and `HeroSlideView.href`.

- [ ] **Step 1: Write a source-level failing test**

```ts
expect(heroSliderSource).toContain('import Link from "next/link"');
expect(heroSliderSource).toContain('<Link href={sl.href} className="btn">');
expect(heroSliderSource).not.toContain('<a href={sl.href} className="btn">');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/hero-navigation.test.ts`
Expected: FAIL because the hero uses a native anchor.

- [ ] **Step 3: Replace the hero CTA anchor with `Link`**

Import `Link` from `next/link` and use it for the article CTA, retaining classes and accessible label content.

- [ ] **Step 4: Run focused tests and full verification**

Run: `npm test -- tests/hero-navigation.test.ts tests/hero-copy.test.ts && npm test && npm run lint && npm run build`
Expected: all commands exit 0.

### Task 4: Release and configure the live hero phrase

**Files:**
- Modify remotely: `/opt/stereoface` release bundle and the active hero block configuration.

**Interfaces:**
- Consumes: deployed `HeroConfig.phrase`.

- [ ] **Step 1: Build a source archive without local runtime artifacts**

Run: project packaging command excluding `.next`, `node_modules`, `.data`, and `dist`.
Expected: archive contains source files and no credentials.

- [ ] **Step 2: Deploy, rebuild and recreate only the StereoFace web service**

Run: server deployment flow from `DEPLOY.md` using the existing Compose networks and volume configuration.
Expected: compose reports a healthy `stereoface-web` service.

- [ ] **Step 3: Add phrase to the active Till Lindemann hero configuration**

Update only the hero block JSON for that article with the phrase in Global Constraints.

- [ ] **Step 4: Verify public behavior**

Run: request the home page and a featured article over `https://stereoface.online`.
Expected: both return HTTP 200; manually verify the CTA preserves audio during client-side navigation.
