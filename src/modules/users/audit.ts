import type { Db } from "@/lib/db";
import { auditLogs } from "./schema";

export type AuditEntry = {
  userId: string | null;
  action: string;
  entity: string;
  entityId?: string;
  diff?: unknown;
  ip?: string;
};

/** Registra una acción administrativa. Nunca debe guardar secretos en `diff`. */
export async function recordAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    diff: entry.diff ?? null,
    ip: entry.ip,
  });
}
