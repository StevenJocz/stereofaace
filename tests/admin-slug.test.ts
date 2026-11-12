import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/lib/db";
import { artists } from "@/db/schema";
import { uniqueSlug } from "@/lib/admin/slug";
import { makeDb } from "./helpers";

let h: DbHandle;
beforeAll(async () => {
  h = await makeDb();
});
afterAll(async () => {
  await h.close();
});

describe("uniqueSlug", () => {
  it("añade sufijo cuando el slug ya existe", async () => {
    await h.db.insert(artists).values({ slug: "dj-x", name: "DJ X" });
    expect(await uniqueSlug(h.db, artists, "dj-x", "artista")).toBe("dj-x-2");
  });

  it("conserva el slug propio al editar (exceptId)", async () => {
    const [a] = await h.db.insert(artists).values({ slug: "propio", name: "Propio" }).returning();
    expect(await uniqueSlug(h.db, artists, "propio", "artista", a.id)).toBe("propio");
  });

  it("usa el valor de respaldo con una base vacía", async () => {
    expect(await uniqueSlug(h.db, artists, "", "artista")).toBe("artista");
  });
});
