import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listMediaAdmin } from "@/modules/media/admin";
import { MediaLibrary } from "@/ui/admin/MediaLibrary";
import { PageHead } from "@/ui/admin/fields";

export default async function MediaAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requirePermission("media:read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, total, pageSize } = await listMediaAdmin(await getDb(), user, { search: sp.q, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => `/admin/medios?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHead eyebrow="Organización" title="Medios" />
      <p className="mt-4 max-w-[70ch] text-muted">
        Imágenes subidas. Cada una necesita texto alternativo, crédito y licencia. Una imagen en uso no se puede borrar.
      </p>
      <form className="mt-6 flex gap-2" role="search">
        <label className="sr-only" htmlFor="q">Buscar imágenes</label>
        <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por texto, crédito o licencia" className="input max-w-sm" />
        <button type="submit" className="btn !px-4 !py-2">Buscar</button>
      </form>
      <MediaLibrary
        items={items.map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.alt,
          credit: i.credit,
          license: i.license,
          bytes: i.bytes,
          usedBy: i.usedBy,
        }))}
        canCreate={can(user.role, "media:create")}
        canEdit={can(user.role, "media:update")}
        canDelete={can(user.role, "media:delete")}
      />
      {pages > 1 && (
        <nav className="mono mt-8 flex items-center gap-4" aria-label="Paginación">
          {page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}
          <span className="text-muted">
            Página {page} de {pages}
          </span>
          {page < pages && <Link href={href(page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
