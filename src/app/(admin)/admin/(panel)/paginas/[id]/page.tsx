import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getPageAdmin } from "@/modules/content/pages-admin";
import { ConfirmDelete } from "@/ui/admin/ConfirmDelete";
import { PageHead } from "@/ui/admin/fields";
import { PageForm } from "@/ui/admin/PageForm";
import { RowAction } from "@/ui/admin/RowAction";
import { deletePageAction, pageStatusAction } from "../actions";

export default async function EditPagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string }>;
}) {
  const user = await requirePermission("page:read");
  const { id } = await params;
  const [page, sp] = await Promise.all([getPageAdmin(await getDb(), user, id), searchParams]);
  if (!page) notFound();
  const published = page.status === "published";

  return (
    <>
      <PageHead eyebrow="Contenido" title={page.title} action={<Link href="/admin/paginas" className="btn">← Páginas</Link>} />
      {sp.creada && <p role="status" className="mono mt-4 text-accent-ink">Página creada.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {published ? <span className="badge badge-ok">Publicada</span> : <span className="badge badge-idle">Borrador</span>}
        {published && <Link href={`/pagina/${page.slug}`} className="mono text-accent-ink" target="_blank">Ver en la web ↗</Link>}
        {can(user.role, "page:publish") && (
          <RowAction action={pageStatusAction} fields={{ id: page.id, status: published ? "draft" : "published" }} label={published ? "Despublicar" : "Publicar"} />
        )}
      </div>
      <div className="mt-8">
        <PageForm
          initial={{
            id: page.id,
            title: page.title,
            slug: page.slug,
            bodyJson: page.bodyJson as JSONContent | null,
            bodyHtml: page.bodyHtml,
            seoTitle: page.seo.title ?? "",
            seoDescription: page.seo.description ?? "",
          }}
        />
      </div>
      {can(user.role, "page:delete") && (
        <div className="mt-12 border-t border-line pt-6">
          <h2 className="mono mb-3 text-muted">Borrar página</h2>
          <ConfirmDelete id={page.id} action={deletePageAction} />
        </div>
      )}
    </>
  );
}
