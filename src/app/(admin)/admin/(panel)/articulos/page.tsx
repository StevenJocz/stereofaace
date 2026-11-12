import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listArticlesAdmin } from "@/modules/content/admin";
import { ARTICLE_STATES } from "@/modules/content/schema";
import { formatShortDate } from "@/lib/time";

const STATE: Record<string, [string, string]> = {
  draft: ["badge-idle", "Borrador"],
  review: ["badge-warn", "En revisión"],
  scheduled: ["badge-warn", "Programado"],
  published: ["badge-ok", "Publicado"],
  archived: ["badge-idle", "Archivado"],
};

export default async function ArticlesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string; pagina?: string; borrado?: string }>;
}) {
  const user = await requirePermission("article:read");
  const sp = await searchParams;
  const estado = ARTICLE_STATES.find((s) => s === sp.estado);
  const q = sp.q && sp.q.trim().length >= 2 ? sp.q.trim() : undefined;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const { items, total, pageSize } = await listArticlesAdmin(await getDb(), user, { status: estado, q, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const m = { estado, q, pagina: String(page), ...over };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `/admin/articulos?${p}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-accent-ink">Contenido</p>
          <h1 className="display t-l mt-1">Artículos</h1>
        </div>
        {can(user.role, "article:create") && (
          <Link href="/admin/articulos/nuevo" className="btn btn-accent">
            Nuevo artículo
          </Link>
        )}
      </div>

      {sp.borrado && (
        <p role="status" className="mono mt-4 text-accent-ink">
          Artículo borrado.
        </p>
      )}

      <form className="mt-6 flex flex-wrap items-end gap-3" action="/admin/articulos">
        <div>
          <label htmlFor="q" className="mono mb-1 block text-muted">
            Buscar por título
          </label>
          <input id="q" name="q" defaultValue={q} className="input" minLength={2} />
        </div>
        <div>
          <label htmlFor="estado" className="mono mb-1 block text-muted">
            Estado
          </label>
          <select id="estado" name="estado" defaultValue={estado ?? ""} className="input">
            <option value="">Todos</option>
            {ARTICLE_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE[s][1]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn">
          Filtrar
        </button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Título</th>
              <th className="py-3 pr-4 font-normal">Categoría</th>
              <th className="py-3 pr-4 font-normal">Autor</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 pr-4 font-normal">Actualizado</th>
              <th className="py-3 font-normal">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const [cls, label] = STATE[a.status];
              return (
                <tr key={a.id} className="border-b border-line hover:bg-accent/5">
                  <td className="py-4 pr-4">
                    <p className="font-semibold">{a.title}</p>
                    <p className="mono text-muted">
                      /{a.slug}
                      {a.isDemo ? " · demo" : ""}
                    </p>
                  </td>
                  <td className="mono py-4 pr-4">{a.categoryName ?? "—"}</td>
                  <td className="mono py-4 pr-4">{a.authorName ?? "—"}</td>
                  <td className="py-4 pr-4">
                    <span className={`badge ${cls}`}>{label}</span>
                    {a.status === "scheduled" && a.scheduledFor && (
                      <p className="mono mt-1 text-muted">{formatShortDate(a.scheduledFor)}</p>
                    )}
                  </td>
                  <td className="mono py-4 pr-4">{formatShortDate(a.updatedAt)}</td>
                  <td className="py-4 text-right">
                    <Link href={`/admin/articulos/${a.id}`} className="btn !px-4 !py-2">
                      Abrir
                    </Link>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted">
                  No hay artículos con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Paginación" className="mono mt-6 flex items-center gap-4">
          {page > 1 && <Link href={href({ pagina: String(page - 1) })}>← Anterior</Link>}
          <span className="text-muted">
            Página {page} de {pages}
          </span>
          {page < pages && <Link href={href({ pagina: String(page + 1) })}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
