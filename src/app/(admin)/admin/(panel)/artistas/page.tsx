import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArtistsAdmin } from "@/modules/artists/admin";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { deleteArtistAction, restoreArtistAction } from "./actions";

export default async function ArtistsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; destacados?: string; borrados?: string; page?: string }>;
}) {
  const user = await requirePermission("artist:read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const { items, total, pageSize } = await listArtistsAdmin(await getDb(), user, {
    search: sp.q,
    featured: sp.destacados === "1" ? true : undefined,
    includeDeleted: sp.borrados === "1",
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    `/admin/artistas?${new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(sp.destacados === "1" ? { destacados: "1" } : {}),
      ...(sp.borrados === "1" ? { borrados: "1" } : {}),
      page: String(p),
    })}`;

  return (
    <>
      <PageHead
        eyebrow="Catálogo"
        title="Artistas"
        action={
          can(user.role, "artist:create") && (
            <Link href="/admin/artistas/nuevo" className="btn btn-accent">
              Nuevo artista
            </Link>
          )
        }
      />
      <form className="mt-6 flex flex-wrap items-center gap-3" role="search">
        <label className="sr-only" htmlFor="q">Buscar artistas</label>
        <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nombre" className="input max-w-xs" />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="destacados" value="1" defaultChecked={sp.destacados === "1"} /> Solo destacados
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="borrados" value="1" defaultChecked={sp.borrados === "1"} /> Incluir ocultos
        </label>
        <button type="submit" className="btn !px-4 !py-2">Filtrar</button>
      </form>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Artista</th>
              <th className="py-3 pr-4 font-normal">País</th>
              <th className="py-3 pr-4 font-normal">Géneros</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 font-normal"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <Link href={`/admin/artistas/${a.id}`} className="display-up hover:text-accent-ink">{a.name}</Link>
                  {a.isDemo && <span className="tag tag-demo ml-2">Demo</span>}
                </td>
                <td className="mono py-3 pr-4">{a.country ?? "—"}</td>
                <td className="py-3 pr-4 text-muted">{a.genres.join(", ") || "—"}</td>
                <td className="py-3 pr-4">
                  {a.deletedAt ? <span className="badge badge-bad">Oculto</span> : a.featured ? <span className="badge badge-ok">Destacado</span> : <span className="badge badge-idle">Normal</span>}
                </td>
                <td className="py-3 text-right">
                  {can(user.role, "artist:delete") &&
                    (a.deletedAt ? (
                      <RowAction action={restoreArtistAction} fields={{ id: a.id }} label="Restaurar" />
                    ) : (
                      <RowAction action={deleteArtistAction} fields={{ id: a.id }} label="Ocultar" />
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">No hay artistas con esos filtros.</p>}
      </div>

      {pages > 1 && (
        <nav className="mono mt-8 flex items-center gap-4" aria-label="Paginación">
          {page > 1 && <Link href={href(page - 1)}>← Anterior</Link>}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && <Link href={href(page + 1)}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
