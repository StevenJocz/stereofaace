import { desc, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { articles, socialPosts } from "@/db/schema";
import { getFacebookConfig } from "@/modules/social/facebook";
import { PageHead } from "@/ui/admin/fields";
import { FacebookSettingsForm } from "@/ui/admin/FacebookSettingsForm";

export default async function FacebookSettingsPage() {
  const user = await requirePermission("setting:update");
  const db = await getDb();
  const config = await getFacebookConfig(db, user);
  const recent = await db
    .select({ title: articles.title, status: socialPosts.status, error: socialPosts.error, at: socialPosts.updatedAt })
    .from(socialPosts)
    .innerJoin(articles, eq(articles.id, socialPosts.articleId))
    .where(eq(socialPosts.network, "facebook"))
    .orderBy(desc(socialPosts.updatedAt))
    .limit(8);
  return (
    <>
      <PageHead eyebrow="Sistema" title="Facebook" />
      <p className="mt-4 max-w-[70ch] text-muted">
        Cada vez que se publique una nota, se sube a tu página de Facebook con el titular, la bajada y el enlace. Solo se publican las notas nuevas desde que
        lo activas: las anteriores no se suben.
      </p>
      <div className="mt-8">
        <FacebookSettingsForm initial={{ enabled: config.enabled, hasToken: config.hasToken, since: config.since }} syncUrl={config.syncToken ? `${SITE_URL}/api/social/sync?token=${config.syncToken}` : null} />
      </div>
      <h2 className="display-up mt-12 text-[1.2rem]">Últimas publicaciones</h2>
      {recent.length === 0 ? (
        <p className="mt-2 text-muted">Todavía no se ha publicado ninguna nota en Facebook.</p>
      ) : (
        <ul className="mt-3 grid max-w-[80ch] gap-2">
          {recent.map((r, i) => (
            <li key={i} className="rounded-[8px] border border-line px-3 py-2">
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-bold">{r.title}</span>
                <span className={r.status === "posted" ? "badge badge-ok" : "badge"}>{r.status === "posted" ? "Publicada" : "Falló"}</span>
              </span>
              {r.error && <span className="mono mt-1 block text-[0.72rem] text-[#ff8a8a]">{r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
