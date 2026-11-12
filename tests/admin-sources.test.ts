import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import type { DbHandle } from "@/lib/db";
import { ForbiddenError, type Actor } from "@/lib/rbac";
import { auditLogs, sources, users } from "@/db/schema";
import {
  createSource,
  deleteSource,
  getSourceAdmin,
  listSourcesAdmin,
  markTermsVerified,
  setSourceActive,
  updateSource,
} from "@/modules/ingest/admin";
import { makeDb } from "./helpers";

let h: DbHandle;
let admin: Actor;
let editor: Actor;

async function mkUser(role: Actor["role"], n: string): Promise<Actor> {
  const [u] = await h.db.insert(users).values({ email: `${n}@example.com`, name: n, role }).returning();
  return { id: u.id, role: u.role };
}
const base = (over: Record<string, unknown> = {}) => ({
  name: "Blog de prueba",
  kind: "rss",
  url: "https://example.org/feed.xml",
  ...over,
});

beforeAll(async () => {
  h = await makeDb();
  admin = await mkUser("admin", "adm");
  editor = await mkUser("editor", "ed");
});
afterAll(async () => {
  await h.close();
});

describe("fuentes de noticias (registro)", () => {
  it("rechaza destinos internos (anti-SSRF) y límites fuera de rango", async () => {
    for (const url of ["http://localhost/feed", "http://192.168.1.5/x", "https://10.0.0.1/a", "ftp://example.org/f"])
      await expect(createSource(h.db, admin, base({ url }))).rejects.toBeInstanceOf(ZodError);
    for (const over of [{ intervalMinutes: 14 }, { intervalMinutes: 1441 }, { dailyLimit: 0 }, { dailyLimit: 501 }])
      await expect(createSource(h.db, admin, base(over))).rejects.toBeInstanceOf(ZodError);
  });

  it("nace desactivada y sin términos verificados aunque llegue active:true", async () => {
    const { id } = await createSource(h.db, admin, base({ active: true, paused: true, termsVerifiedAt: new Date() }));
    const s = await getSourceAdmin(h.db, admin, id);
    expect(s).toMatchObject({ active: false, paused: false, termsVerifiedAt: null, rightsPolicy: "metadata_only", publishPolicy: "always_review" });
  });

  it("no se activa sin términos verificados; tras verificarlos sí", async () => {
    const { id } = await createSource(h.db, admin, base({ name: "A activar" }));
    await expect(setSourceActive(h.db, admin, id, true)).rejects.toMatchObject({ code: "terms_unverified" });
    await markTermsVerified(h.db, admin, id);
    await setSourceActive(h.db, admin, id, true);
    expect((await getSourceAdmin(h.db, admin, id))?.active).toBe(true);
    await setSourceActive(h.db, admin, id, false);
    expect((await getSourceAdmin(h.db, admin, id))?.active).toBe(false);
  });

  it("cambiar la URL de una fuente activa la desactiva y exige verificar de nuevo", async () => {
    const { id } = await createSource(h.db, admin, base({ name: "Cambiante" }));
    await markTermsVerified(h.db, admin, id);
    await setSourceActive(h.db, admin, id, true);
    await updateSource(h.db, admin, id, base({ name: "Cambiante", url: "https://otro.example.org/feed" }));
    expect(await getSourceAdmin(h.db, admin, id)).toMatchObject({ active: false, termsVerifiedAt: null });
    await updateSource(h.db, admin, id, base({ name: "Cambiante 2", url: "https://otro.example.org/feed" }));
    expect((await getSourceAdmin(h.db, admin, id))?.name).toBe("Cambiante 2");
  });

  it("un editor lee pero no crea, activa ni verifica", async () => {
    const { id } = await createSource(h.db, admin, base({ name: "Para editor" }));
    expect((await listSourcesAdmin(h.db, editor)).length).toBeGreaterThan(0);
    await expect(createSource(h.db, editor, base())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(markTermsVerified(h.db, editor, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setSourceActive(h.db, editor, id, true)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("borrar elimina la fuente y lo deja auditado", async () => {
    const { id } = await createSource(h.db, admin, base({ name: "Efímera" }));
    await deleteSource(h.db, admin, id);
    expect(await h.db.select().from(sources).where(eq(sources.id, id))).toHaveLength(0);
    const logs = await h.db.select().from(auditLogs).where(eq(auditLogs.entityId, id));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["source.create", "source.delete"]));
  });
});
