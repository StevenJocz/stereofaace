import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { SUBSCRIBER_STATES, type SubscriberState } from "@/modules/settings/schema";
import { listSubscribers } from "@/modules/settings/subscribers-admin";
import { ConfirmDelete } from "@/ui/admin/ConfirmDelete";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { deleteSubscriberAction, subscriberStatusAction } from "./actions";

const LABEL: Record<SubscriberState, string> = { pending: "Pendiente", confirmed: "Confirmado", unsubscribed: "Baja" };
const BADGE: Record<SubscriberState, string> = { pending: "badge-warn", confirmed: "badge-ok", unsubscribed: "badge-idle" };
const day = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

export default async function SubscribersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; page?: string }>;
}) {
  const user = await requirePermission("subscriber:read");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const status = SUBSCRIBER_STATES.find((s) => s === sp.estado);
  const { items, total, pageSize, counts } = await listSubscribers(await getDb(), user, { search: sp.q, status, page });
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(status ? { estado: status } : {}), ...extra }).toString();
  const canUpdate = can(user.role, "subscriber:update");
  const canDelete = can(user.role, "subscriber:delete");

  return (
    <>
      <PageHead
        eyebrow="Audiencia"
        title="Suscriptores"
        action={
          <a href={`/admin/suscriptores/export?${qs()}`} className="btn" download>
            Exportar CSV
          </a>
        }
      />
      <p className="mt-4 max-w-[70ch] text-muted">
        Personas que dejaron su correo en el newsletter. El envío de correos aún no está disponible: aquí solo se
        consultan y gestionan.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {SUBSCRIBER_STATES.map((s) => (
          <li key={s} className="panel p-4">
            <p className="mono text-muted">{LABEL[s]}</p>
            <p className="display-cond mt-1 text-[2.4rem]">{counts[s]}</p>
          </li>
        ))}
      </ul>

      <form className="mt-6 flex flex-wrap items-center gap-3" role="search">
        <label className="sr-only" htmlFor="q">Buscar por correo</label>
        <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por correo" className="input max-w-xs" />
        <label className="sr-only" htmlFor="estado">Estado</label>
        <select id="estado" name="estado" defaultValue={status ?? ""} className="input !w-auto">
          <option value="">Todos los estados</option>
          {SUBSCRIBER_STATES.map((s) => (
            <option key={s} value={s}>{LABEL[s]}</option>
          ))}
        </select>
        <button type="submit" className="btn !px-4 !py-2">Filtrar</button>
      </form>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Correo</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 pr-4 font-normal">Origen</th>
              <th className="py-3 pr-4 font-normal">Desde</th>
              <th className="py-3 font-normal"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-line align-top">
                <td className="py-3 pr-4 break-all">{s.email}</td>
                <td className="py-3 pr-4"><span className={`badge ${BADGE[s.status]}`}>{LABEL[s.status]}</span></td>
                <td className="mono py-3 pr-4">{s.source}</td>
                <td className="mono py-3 pr-4">{day.format(s.consentAt)}</td>
                <td className="py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canUpdate &&
                      SUBSCRIBER_STATES.filter((x) => x !== s.status).map((x) => (
                        <RowAction key={x} action={subscriberStatusAction} fields={{ id: s.id, status: x }} label={LABEL[x]} ariaLabel={`Marcar ${s.email} como ${LABEL[x]}`} />
                      ))}
                    {canDelete && <ConfirmDelete id={s.id} action={deleteSubscriberAction} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">No hay suscriptores con esos filtros.</p>}
      </div>

      {pages > 1 && (
        <nav className="mono mt-8 flex items-center gap-4" aria-label="Paginación">
          {page > 1 && <Link href={`/admin/suscriptores?${qs({ page: String(page - 1) })}`}>← Anterior</Link>}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && <Link href={`/admin/suscriptores?${qs({ page: String(page + 1) })}`}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
