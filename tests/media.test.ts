import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateImageUpload } from "@/modules/media/validation";
import { readStoredMedia, storeImageAtomically } from "@/modules/media/storage";
import { createUploadedMedia, getPublicMedia } from "@/modules/media/service";
import { makeDb } from "./helpers";
import { users } from "@/db/schema";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("media uploads", () => {
  it("accepts a PNG only when its declared MIME matches its bytes", async () => {
    const file = new File([PNG], "cover.png", { type: "image/png" });
    expect(await validateImageUpload(file)).toMatchObject({ ok: true, mime: "image/png", extension: "png" });

    const spoofed = new File([PNG], "cover.jpg", { type: "image/jpeg" });
    expect(await validateImageUpload(spoofed)).toMatchObject({ ok: false, message: expect.stringMatching(/MIME/i) });
  });

  it("rejects disallowed formats and files larger than 10 MiB", async () => {
    const svg = new File(["<svg />"], "cover.svg", { type: "image/svg+xml" });
    expect(await validateImageUpload(svg)).toMatchObject({ ok: false });
    const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "cover.png", { type: "image/png" });
    expect(await validateImageUpload(tooLarge)).toMatchObject({ ok: false, message: expect.stringMatching(/10 MiB/) });
  });

  it("stores an accepted image under a generated safe key and reads it back", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "stereoface-media-"));
    roots.push(root);
    const file = new File([PNG], "untrusted-name.png", { type: "image/png" });
    const uploaded = await storeImageAtomically(root, file, { key: "8e565f9c-5944-4eb0-8bd1-e5bc8aebebd0" });

    expect(uploaded.storageKey).toBe("8e565f9c-5944-4eb0-8bd1-e5bc8aebebd0");
    expect(uploaded.path).toBe(path.join(root, uploaded.storageKey));
    await expect(readFile(uploaded.path)).resolves.toEqual(Buffer.from(PNG));
    await expect(readStoredMedia(root, uploaded.storageKey)).resolves.toEqual(Buffer.from(PNG));
    await expect(readStoredMedia(root, "../package.json")).resolves.toBeNull();
  });

  it("records an authorized upload and exposes only its public UUID URL", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "stereoface-media-"));
    roots.push(root);
    const h = await makeDb();
    try {
      const [editor] = await h.db.insert(users).values({ email: "media@example.com", name: "Media", role: "editor" }).returning();
      const stored = await createUploadedMedia(h.db, { id: editor.id, role: editor.role }, new File([PNG], "cover.png", { type: "image/png" }), {
        alt: "Una portada verde",
        credit: "Steven Jocz",
        license: "Propia",
        root,
      });
      expect(stored.url).toMatch(/^http:\/\/localhost:3000\/media\/[0-9a-f-]+$/);
      expect((await getPublicMedia(h.db, stored.storageKey))?.alt).toBe("Una portada verde");
      expect(await getPublicMedia(h.db, "../package.json")).toBeNull();
    } finally {
      await h.close();
    }
  });
});
