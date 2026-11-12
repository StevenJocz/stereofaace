import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listReleasesAdmin } from "@/modules/releases/admin";
import { RELEASE_KINDS, type ReleaseKind } from "@/modules/releases/schema";
import { RELEASE_KIND_OPTIONS } from "@/ui/admin/options";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { deleteReleaseAction, releaseStatusAction, restoreReleaseAction } from "./actions";

const day = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "UTC" });

export default async function ReleasesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; tipo?: string; borrados?: string; page?: string }>;
}) {
  const user = await requirePermission("release:read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const kind = RELEASE_KINDS.find((k) => k === sp.tipo) as ReleaseKind | undefined;
  const status = sp.estado === "draft" || sp.estado === "published" ? sp.estado : undefined;
  const { items, total, pageSize } = await listReleasesAdmin(await getDb(), user, {
    search: sp.q,
    status,
    kind,
    includeDeleted: sp.borrados === "1",
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    `/admin/lanzamientos?${new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(status ? { estado: status } : {}),
      ...(kind ? { tipo: kind } : {}),
      ...(sp.borrados === "1" ? { borrados: "1" } : {}),
      page: String(p),
    })}`;
  const canPublish = can(user.role, "release:publish");

  return (
    <>
      <PageHead
        eyebrow="Catálogo"
        title="Lanzamientos"
        action={
          can(user.role, "release:create") && (
            <Link href="/admin/lanzamientos/nuevo" className="btn btn-accent">
              Nuevo lanzamiento
            </Link>
          )
        }
      />
      <form className="mt-6 flex flex-wrap items-center gap-3" role="search">
        <label className="sr-only" htmlFor="q">Buscar lanzamientos</label>
        <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por título" className="input max-w-xs" />
        <label className="sr-only" htmlFor="estado">Estado</label>
        <select id="estado" name="estado" defaultValue={status ?? ""} className="input !w-auto">
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
        </select>
        <label className="sr-only" htmlFor="tipo">Tipo</label>
        <select id="tipo" name="tipo" defaultValue={kind ?? ""} className="input !w-auto">
          <option value="">Todos los tipos</option>
          {RELEASE_KIND_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="borrados" value="1" defaultChecked={sp.borrados === "1"} /> Incluir ocultos
        </label>
        <button type="submit" className="btn !px-4 !py-2">Filtrar</button>
      </form>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Lanzamiento</th>
              <th className="py-3 pr-4 font-normal">Tipo</th>
              <th className="py-3 pr-4 font-normal">Fecha</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 font-normal"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.id} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <Link href={`/admin/lanzamientos/${r.id}`} className="display-up hover:text-accent-ink">{r.title}</Link>
                  {r.isDemo && <span className="tag tag-demo ml-2">Demo</span>}
                  <p className="text-muted">{r.artistNames.join(", ")}</p>
                </td>
                <td className="mono py-3 pr-4">{RELEASE_KIND_OPTIONS.find(([v]) => v === r.kind)?.[1] ?? r.kind}</td>
                <td className="mono py-3 pr-4">{day.format(r.releasedAt)}</td>
                <td className="py-3 pr-4">
                  {r.deletedAt ? <span className="badge badge-bad">Oculto</span> : r.status === "published" ? <span className="badge badge-ok">Publicado</span> : <span className="badge badge-idle">Borrador</span>}
                </td>
                <td className="py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {!r.deletedAt && canPublish && (
                      <RowAction action={releaseStatusAction} fields={{ id: r.id, status: r.status === "published" ? "draft" : "published" }} label={r.status === "published" ? "Despublicar" : "Publicar"} />
                    )}
                    {can(user.role, "release:delete") &&
                      (r.deletedAt ? (
                        <RowAction action={restoreReleaseAction} fields={{ id: r.id }} label="Restaurar" />
                      ) : (
                        <RowAction action={deleteReleaseAction} fields={{ id: r.id }} label="Ocultar" />
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">No hay lanzamientos con esos filtros.</p>}
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
