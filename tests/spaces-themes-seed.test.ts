import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { DbHandle } from "@/lib/db";
import { seedBase } from "@/db/seed-base";
import { spaceThemes } from "@/modules/spaces/schema";
import { DEFAULT_THEMES } from "@/modules/spaces/defaults";
import { makeDb } from "./helpers";

let h: DbHandle;
beforeAll(async () => {
  h = await makeDb();
});
afterAll(() => h.close());

describe("plantillas de Spaces en la base", () => {
  it("siembra las 20 plantillas", async () => {
    await seedBase(h.db);
    expect(await h.db.select().from(spaceThemes)).toHaveLength(20);
  });
  it("una plantilla antigua (sin portada) la recibe al sembrar de nuevo, sin pisar otros cambios del administrador", async () => {
    // Simula la fila de antes de existir las portadas, ya editada por el administrador.
    await h.db.update(spaceThemes).set({ design: sql`(${spaceThemes.design} - 'cover') || '{"cardOpacity": 55}'::jsonb` }).where(eq(spaceThemes.slug, "neon-rave"));
    const [antes] = await h.db.select().from(spaceThemes).where(eq(spaceThemes.slug, "neon-rave"));
    expect((antes.design as Record<string, unknown>).cover).toBeUndefined();
    await seedBase(h.db);
    const [despues] = await h.db.select().from(spaceThemes).where(eq(spaceThemes.slug, "neon-rave"));
    expect(despues.design.cover).toBe(DEFAULT_THEMES.find((t) => t.slug === "neon-rave")!.design.cover);
    expect(despues.design.cardOpacity).toBe(55);
  });
  it("si el administrador quitó la portada a propósito (null), no se la vuelve a poner", async () => {
    await h.db.update(spaceThemes).set({ design: sql`${spaceThemes.design} || '{"cover": null}'::jsonb` }).where(eq(spaceThemes.slug, "acid-house"));
    await seedBase(h.db);
    const [t] = await h.db.select().from(spaceThemes).where(eq(spaceThemes.slug, "acid-house"));
    expect(t.design.cover).toBeNull();
  });
});
