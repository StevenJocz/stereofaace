import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listEventsAdmin } from "@/modules/events/admin";
import { EVENT_KIND_OPTIONS } from "@/ui/admin/options";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { deleteEventAction, eventStatusAction, restoreEventAction } from "./actions";

const when = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

export default async function EventsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; proximos?: string; borrados?: string; page?: string }>;
}) {
  const user = await requirePermission("event:read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const status = sp.estado === "draft" || sp.estado === "published" || sp.estado === "cancelled" ? sp.estado : undefined;
  const { items, total, pageSize } = await listEventsAdmin(await getDb(), user, {
    search: sp.q,
    status,
    upcoming: sp.proximos === "1",
    includeDeleted: sp.borrados === "1",
    page,
  });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    `/admin/agenda?${new URLSearchParams({
      ...(sp.q ? { q: sp.q } : {}),
      ...(status ? { estado: status } : {}),
      ...(sp.proximos === "1" ? { proximos: "1" } : {}),
      ...(sp.borrados === "1" ? { borrados: "1" } : {}),
      page: String(p),
    })}`;
  const canPublish = can(user.role, "event:publish");

  return (
    <>
      <PageHead
        eyebrow="Catálogo"
        title="Agenda"
        action={
          can(user.role, "event:create") && (
            <Link href="/admin/agenda/nuevo" className="btn btn-accent">
              Nuevo evento
            </Link>
          )
        }
      />
      <form className="mt-6 flex flex-wrap items-center gap-3" role="search">
        <label className="sr-only" htmlFor="q">Buscar eventos</label>
        <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, ciudad o recinto" className="input max-w-xs" />
        <label className="sr-only" htmlFor="estado">Estado</label>
        <select id="estado" name="estado" defaultValue={status ?? ""} className="input !w-auto">
          <option value="">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="proximos" value="1" defaultChecked={sp.proximos === "1"} /> Solo próximos
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="borrados" value="1" defaultChecked={sp.borrados === "1"} /> Incluir ocultos
        </label>
        <button type="submit" className="btn !px-4 !py-2">Filtrar</button>
      </form>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Evento</th>
              <th className="py-3 pr-4 font-normal">Cuándo</th>
              <th className="py-3 pr-4 font-normal">Dónde</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 font-normal"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((ev) => (
              <tr key={ev.id} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <Link href={`/admin/agenda/${ev.id}`} className="display-up hover:text-accent-ink">{ev.name}</Link>
                  {ev.isDemo && <span className="tag tag-demo ml-2">Demo</span>}
                  <p className="mono text-muted">{EVENT_KIND_OPTIONS.find(([v]) => v === ev.kind)?.[1] ?? ev.kind}</p>
                </td>
                <td className="mono py-3 pr-4">{when.format(ev.startsAt)}</td>
                <td className="py-3 pr-4">{ev.city}, {ev.country}</td>
                <td className="py-3 pr-4">
                  {ev.deletedAt ? (
                    <span className="badge badge-bad">Oculto</span>
                  ) : ev.status === "published" ? (
                    <span className="badge badge-ok">Publicado</span>
                  ) : ev.status === "cancelled" ? (
                    <span className="badge badge-warn">Cancelado</span>
                  ) : (
                    <span className="badge badge-idle">Borrador</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {!ev.deletedAt && canPublish && ev.status !== "published" && (
                      <RowAction action={eventStatusAction} fields={{ id: ev.id, status: "published" }} label="Publicar" />
                    )}
                    {!ev.deletedAt && canPublish && ev.status === "published" && (
                      <RowAction action={eventStatusAction} fields={{ id: ev.id, status: "cancelled" }} label="Cancelar" />
                    )}
                    {can(user.role, "event:delete") &&
                      (ev.deletedAt ? (
                        <RowAction action={restoreEventAction} fields={{ id: ev.id }} label="Restaurar" />
                      ) : (
                        <RowAction action={deleteEventAction} fields={{ id: ev.id }} label="Ocultar" />
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">No hay eventos con esos filtros.</p>}
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
