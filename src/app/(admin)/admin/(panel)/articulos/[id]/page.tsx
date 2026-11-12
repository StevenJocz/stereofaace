import Link from "next/link";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArtistOptions } from "@/modules/artists/admin";
import { getArticleAdmin, listRevisions } from "@/modules/content/admin";
import { categories } from "@/modules/taxonomy/schema";
import { ArticleEditor, type EditorArticle } from "@/ui/admin/ArticleEditor";

export default async function ArticleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("article:read");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = await getDb();
  const [a, cats, revs, artistOptions] = await Promise.all([
    getArticleAdmin(db, user, id),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.position)),
    listRevisions(db, user, id),
    can(user.role, "artist:read") ? listArtistOptions(db, user) : Promise.resolve([]),
  ]);
  if (!a) notFound();

  const article: EditorArticle = {
    id: a.id,
    title: a.title,
    slug: a.slug,
    kicker: a.kicker ?? "",
    dek: a.dek ?? "",
    categoryId: a.categoryId ?? "",
    status: a.status,
    scheduledFor: a.scheduledFor?.toISOString() ?? "",
    layout: a.layout,
    authorName: a.authorName ?? "",
    coverUrl: a.coverUrl ?? "",
    coverAlt: a.coverAlt ?? "",
    coverCredit: a.coverCredit ?? "",
    coverArt: a.coverArt ?? null,
    seoTitle: a.seo.title ?? "",
    seoDescription: a.seo.description ?? "",
    noindex: !!a.seo.noindex,
    tags: a.tags,
    artistIds: a.artistIds,
    references: a.references,
    bodyJson: (a.bodyJson as EditorArticle["bodyJson"]) ?? null,
    bodyHtml: a.bodyHtml ?? "",
    updatedAt: a.updatedAt.toISOString(),
    isDemo: a.isDemo,
  };

  return (
    <>
      <Link href="/admin/articulos" className="mono text-muted hover:text-accent-ink">
        ← Artículos
      </Link>
      <ArticleEditor
        article={article}
        categories={cats}
        artistOptions={artistOptions}
        revisions={revs.map((r) => ({
          id: r.id,
          title: r.title,
          createdAt: r.createdAt.toISOString(),
          authorName: r.authorName ?? "—",
        }))}
        canEdit={a.canEdit && can(user.role, "article:update")}
        canPublish={can(user.role, "article:publish")}
        canDelete={can(user.role, "article:delete")}
      />
    </>
  );
}
