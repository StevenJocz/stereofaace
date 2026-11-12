import { and, desc, eq, lt, gte } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { assertCan, type Actor } from "@/lib/rbac";
import { studioHistory } from "./schema";

const DEDUPE_MS = 30_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const entrySchema = z.object({
  title: z.string().trim().min(1).transform((s) => s.slice(0, 200)),
  artist: z.string().trim().default("").transform((s) => s.slice(0, 200)),
  source: z.enum(["local", "azuracast", "cart"]),
  djName: z.string().trim().max(80).optional(),
});
export type HistoryEntry = z.input<typeof entrySchema>;

export type HistoryRow = { id: string; playedAt: string; title: string; artist: string; source: string; djName: string | null };

/** Anota una pista que pasó al aire. Una entrada idéntica a la anterior en menos de 30 s (pausa y reanudación) no se repite. */
export async function logPlayed(db: Db, actor: Actor | null, raw: HistoryEntry, now: Date = new Date()): Promise<void> {
  assertCan(actor, "station:update");
  const e = entrySchema.parse(raw);
  const [prev] = await db
    .select()
    .from(studioHistory)
    .where(and(eq(studioHistory.userId, actor.id), gte(studioHistory.playedAt, new Date(now.getTime() - DEDUPE_MS))))
    .orderBy(desc(studioHistory.playedAt))
    .limit(1);
  if (prev && prev.title === e.title && prev.artist === e.artist) return;
  await db.insert(studioHistory).values({ playedAt: now, title: e.title, artist: e.artist, source: e.source, djName: e.djName ?? null, userId: actor.id });
}

export async function listHistory(db: Db, actor: Actor | null, opts: { limit?: number; before?: Date } = {}): Promise<HistoryRow[]> {
  assertCan(actor, "station:update");
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT)));
  const rows = await db
    .select()
    .from(studioHistory)
    .where(opts.before ? lt(studioHistory.playedAt, opts.before) : undefined)
    .orderBy(desc(studioHistory.playedAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, playedAt: r.playedAt.toISOString(), title: r.title, artist: r.artist, source: r.source, djName: r.djName }));
}
