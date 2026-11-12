import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { assertCan, can, type Actor } from "@/lib/rbac";
import { articles, ARTICLE_STATES, type ArticleState } from "@/modules/content/schema";
import { artists } from "@/modules/artists/schema";
import { releases } from "@/modules/releases/schema";
import { events } from "@/modules/events/schema";
import { subscribers, SUBSCRIBER_STATES, type SubscriberState } from "@/modules/settings/schema";
import { radioStations } from "@/modules/radio/schema";
import { auditLogs, users } from "@/modules/users/schema";

export type DashboardStats = {
  articles: Record<ArticleState, number>;
  artists: number;
  releases: number;
  eventsUpcoming: number;
  subscribers: Record<SubscriberState, number>;
  stations: { total: number; enabled: number };
  recentAudit: { action: string; entity: string; userName: string | null; createdAt: Date }[];
};

const n = (v: unknown) => Number(v ?? 0);

/** Cifras reales para el panel de inicio. Requiere `dashboard:read`. */
export async function getDashboardStats(db: Db, actor: Actor | null, now = new Date()): Promise<DashboardStats> {
  assertCan(actor, "dashboard:read");
  const [artRows, subRows, [artistCount], [releaseCount], [eventCount], [stationCount], recent] = await Promise.all([
    db
      .select({ status: articles.status, c: sql<number>`count(*)` })
      .from(articles)
      .where(isNull(articles.deletedAt))
      .groupBy(articles.status),
    db.select({ status: subscribers.status, c: sql<number>`count(*)` }).from(subscribers).groupBy(subscribers.status),
    db.select({ c: sql<number>`count(*)` }).from(artists).where(isNull(artists.deletedAt)),
    db
      .select({ c: sql<number>`count(*)` })
      .from(releases)
      .where(and(isNull(releases.deletedAt), eq(releases.status, "published"))),
    db
      .select({ c: sql<number>`count(*)` })
      .from(events)
      .where(and(isNull(events.deletedAt), eq(events.status, "published"), gte(events.startsAt, now))),
    db
      .select({
        total: sql<number>`count(*)`,
        enabled: sql<number>`count(*) filter (where ${radioStations.enabled})`,
      })
      .from(radioStations)
      .where(isNull(radioStations.deletedAt)),
    db
      .select({
        action: auditLogs.action,
        entity: auditLogs.entity,
        userName: users.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(8),
  ]);

  const byArticle = Object.fromEntries(ARTICLE_STATES.map((s) => [s, 0])) as Record<ArticleState, number>;
  for (const r of artRows) byArticle[r.status] = n(r.c);
  const bySub = Object.fromEntries(SUBSCRIBER_STATES.map((s) => [s, 0])) as Record<SubscriberState, number>;
  for (const r of subRows) bySub[r.status] = n(r.c);

  return {
    articles: byArticle,
    artists: n(artistCount.c),
    releases: n(releaseCount.c),
    eventsUpcoming: n(eventCount.c),
    subscribers: bySub,
    stations: { total: n(stationCount.total), enabled: n(stationCount.enabled) },
    // La actividad registrada es de quien puede ver la auditoría (no de todo el que ve el panel).
    recentAudit: can(actor.role, "audit:read") ? recent : [],
  };
}
