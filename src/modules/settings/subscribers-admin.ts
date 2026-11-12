import { and, desc, eq, ilike, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, type Actor } from "@/lib/rbac";
import { csvCell } from "@/lib/csv";
import { recordAudit } from "@/modules/users/audit";
import { SUBSCRIBER_STATES, subscribers, type SubscriberState } from "./schema";

export const SUBSCRIBER_PAGE_SIZE = 50;
const EXPORT_LIMIT = 50_000;
export type SubscriberRow = typeof subscribers.$inferSelect;
type Query = { search?: string; status?: SubscriberState };

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const filter = (q: Query) =>
  and(
    q.status ? eq(subscribers.status, q.status) : undefined,
    q.search?.trim() ? ilike(subscribers.email, `%${likeEscape(q.search.trim())}%`) : undefined,
  );

export async function listSubscribers(
  db: Db,
  actor: Actor | null,
  q: Query & { page?: number } = {},
): Promise<{ items: SubscriberRow[]; total: number; pageSize: number; counts: Record<SubscriberState, number> }> {
  assertCan(actor, "subscriber:read");
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const where = filter(q);
  const [items, [{ c }], byStatus] = await Promise.all([
    db
      .select()
      .from(subscribers)
      .where(where)
      .orderBy(desc(subscribers.createdAt))
      .limit(SUBSCRIBER_PAGE_SIZE)
      .offset((page - 1) * SUBSCRIBER_PAGE_SIZE),
    db.select({ c: sql<number>`count(*)` }).from(subscribers).where(where),
    db.select({ status: subscribers.status, c: sql<number>`count(*)` }).from(subscribers).groupBy(subscribers.status),
  ]);
  const counts = Object.fromEntries(SUBSCRIBER_STATES.map((s) => [s, 0])) as Record<SubscriberState, number>;
  for (const r of byStatus) counts[r.status] = Number(r.c);
  return { items, total: Number(c), pageSize: SUBSCRIBER_PAGE_SIZE, counts };
}

/** Confirmar fija `confirmedAt`; los demás cambios lo conservan. */
export async function setSubscriberStatus(db: Db, actor: Actor | null, id: string, status: SubscriberState): Promise<void> {
  assertCan(actor, "subscriber:update");
  if (!SUBSCRIBER_STATES.includes(status)) throw new DomainError("bad_request", "Estado inválido");
  const done = await db
    .update(subscribers)
    .set({ status, ...(status === "confirmed" ? { confirmedAt: new Date() } : {}) })
    .where(eq(subscribers.id, id))
    .returning({ id: subscribers.id });
  if (done.length === 0) throw new DomainError("not_found", "Suscriptor no encontrado");
  await recordAudit(db, { userId: actor.id, action: "subscriber.status", entity: "subscriber", entityId: id, diff: { status } });
}

/** Borrado real (derecho de supresión). No se guarda el correo en la auditoría. */
export async function deleteSubscriber(db: Db, actor: Actor | null, id: string): Promise<void> {
  assertCan(actor, "subscriber:delete");
  const done = await db.delete(subscribers).where(eq(subscribers.id, id)).returning({ id: subscribers.id });
  if (done.length === 0) throw new DomainError("not_found", "Suscriptor no encontrado");
  await recordAudit(db, { userId: actor.id, action: "subscriber.delete", entity: "subscriber", entityId: id });
}

/** CSV de los suscriptores que cumplen el filtro (máximo 50 000 filas). */
export async function exportSubscribersCsv(db: Db, actor: Actor | null, q: Query = {}): Promise<string> {
  assertCan(actor, "subscriber:read");
  const rows = await db.select().from(subscribers).where(filter(q)).orderBy(desc(subscribers.createdAt)).limit(EXPORT_LIMIT);
  const head = "email,estado,origen,consentimiento,confirmado";
  const lines = rows.map((r) =>
    [r.email, r.status, r.source, r.consentAt.toISOString(), r.confirmedAt?.toISOString() ?? ""].map(csvCell).join(","),
  );
  return [head, ...lines].join("\n") + "\n";
}
