import { asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { recordAudit } from "@/modules/users/audit";
import { sources } from "./schema";
import { sourceInputSchema } from "./validators";

export type SourceRow = typeof sources.$inferSelect;

export async function listSourcesAdmin(db: Db, actor: Actor | null): Promise<SourceRow[]> {
  assertCan(actor, "source:read");
  return db.select().from(sources).orderBy(asc(sources.name));
}

export async function getSourceAdmin(db: Db, actor: Actor | null, id: string): Promise<SourceRow | null> {
  assertCan(actor, "source:read");
  const [row] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
  return row ?? null;
}

const fields = (input: ReturnType<typeof sourceInputSchema.parse>) => ({
  name: input.name,
  kind: input.kind,
  url: input.url,
  intervalMinutes: input.intervalMinutes,
  defaultCategoryId: input.defaultCategoryId ?? null,
  rightsPolicy: input.rightsPolicy,
  publishPolicy: input.publishPolicy,
  dailyLimit: input.dailyLimit,
  legalNotes: input.legalNotes ?? null,
});

/** Crea la fuente SIEMPRE desactivada y sin términos verificados, sin importar lo que llegue. */
export async function createSource(db: Db, actor: Actor | null, raw: unknown): Promise<{ id: string }> {
  assertCan(actor, "source:create");
  const base = typeof raw === "object" && raw !== null ? raw : {};
  const input = sourceInputSchema.parse({ ...base, active: false, termsVerifiedAt: undefined });
  const [row] = await db
    .insert(sources)
    .values({ ...fields(input), active: false, paused: false, termsVerifiedAt: null })
    .returning({ id: sources.id });
  await recordAudit(db, { userId: actor.id, action: "source.create", entity: "source", entityId: row.id });
  return row;
}

/**
 * Edita la fuente. Si cambia la URL, la verificación de términos ya no vale: se desactiva y hay que verificar
 * de nuevo. La activación solo se cambia con `setSourceActive`.
 */
export async function updateSource(db: Db, actor: Actor | null, id: string, raw: unknown): Promise<void> {
  assertCan(actor, "source:update");
  const current = await getSourceAdmin(db, actor, id);
  if (!current) throw new DomainError("not_found", "Fuente no encontrada");
  const base = typeof raw === "object" && raw !== null ? raw : {};
  const urlChanged = (base as { url?: unknown }).url !== current.url;
  const input = sourceInputSchema.parse({
    ...base,
    active: current.active && !urlChanged,
    termsVerifiedAt: urlChanged ? undefined : (current.termsVerifiedAt ?? undefined),
  });
  await db
    .update(sources)
    .set({ ...fields(input), ...(urlChanged ? { active: false, termsVerifiedAt: null } : {}) })
    .where(eq(sources.id, id));
  await recordAudit(db, { userId: actor.id, action: "source.update", entity: "source", entityId: id, diff: { urlChanged } });
}

/** Marca que alguien revisó términos y licencia de la fuente. */
export async function markTermsVerified(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "source:manage");
  const done = await db.update(sources).set({ termsVerifiedAt: new Date() }).where(eq(sources.id, id)).returning({ id: sources.id });
  if (done.length === 0) throw new DomainError("not_found", "Fuente no encontrada");
  await recordAudit(db, { userId: actor.id, action: "source.terms_verified", entity: "source", entityId: id });
}

/** Activar exige términos verificados; desactivar siempre se puede. */
export async function setSourceActive(db: Db, actor: Actor | null, id: string, active: boolean): Promise<void> {
  assertCan(actor, "source:manage");
  const current = await getSourceAdmin(db, actor, id);
  if (!current) throw new DomainError("not_found", "Fuente no encontrada");
  if (active && !current.termsVerifiedAt)
    throw new DomainError("terms_unverified", "Verifica los términos y la licencia de la fuente antes de activarla.");
  await db.update(sources).set({ active }).where(eq(sources.id, id));
  await recordAudit(db, { userId: actor.id, action: "source.active", entity: "source", entityId: id, diff: { active } });
}

export async function deleteSource(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "source:delete");
  const done = await db.delete(sources).where(eq(sources.id, id)).returning({ id: sources.id });
  if (done.length === 0) throw new DomainError("not_found", "Fuente no encontrada");
  await recordAudit(db, { userId: actor.id, action: "source.delete", entity: "source", entityId: id });
}
