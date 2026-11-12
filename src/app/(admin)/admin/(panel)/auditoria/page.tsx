import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listAudit, listUsers } from "@/modules/users/admin";
import { PageHead } from "@/ui/admin/fields";

const when = new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Bogota" });
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function AuditAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ entidad?: string; usuario?: string; desde?: string; hasta?: string; page?: string }>;
}) {
  const user = await requirePermission("audit:read");
  const sp = await searchParams;
  const db = await getDb();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const [{ items, total, pageSize }, people] = await Promise.all([
    listAudit(db, user, {
      entity: sp.entidad?.trim() || undefined,
      userId: sp.usuario || undefined,
      // Fechas en hora de Bogotá (UTC−5): el día completo.
      from: isDate(sp.desde) ? new Date(`${sp.desde}T00:00:00-05:00`) : undefined,
      to: isDate(sp.hasta) ? new Date(`${sp.hasta}T23:59:59.999-05:00`) : undefined,
      page,
    }),
    can(user.role, "user:read") ? listUsers(db, user) : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const qs = (p: number) =>
    new URLSearchParams({
      ...(sp.entidad ? { entidad: sp.entidad } : {}),
      ...(sp.usuario ? { usuario: sp.usuario } : {}),
      ...(isDate(sp.desde) ? { desde: sp.desde! } : {}),
      ...(isDate(sp.hasta) ? { hasta: sp.hasta! } : {}),
      page: String(p),
    }).toString();

  return (
    <>
      <PageHead eyebrow="Sistema" title="Auditoría" />
      <p className="mt-4 max-w-[70ch] text-muted">Registro de quién cambió qué. Es de solo lectura.</p>
      <form className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <div>
          <label className="mono mb-1 block text-muted" htmlFor="entidad">Entidad</label>
          <input id="entidad" name="entidad" defaultValue={sp.entidad ?? ""} placeholder="artist, event…" className="input" />
        </div>
        <div>
          <label className="mono mb-1 block text-muted" htmlFor="usuario">Usuario</label>
          <select id="usuario" name="usuario" defaultValue={sp.usuario ?? ""} className="input">
            <option value="">Todos</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mono mb-1 block text-muted" htmlFor="desde">Desde</label>
          <input id="desde" name="desde" type="date" defaultValue={isDate(sp.desde) ? sp.desde : ""} className="input" />
        </div>
        <div>
          <label className="mono mb-1 block text-muted" htmlFor="hasta">Hasta</label>
          <input id="hasta" name="hasta" type="date" defaultValue={isDate(sp.hasta) ? sp.hasta : ""} className="input" />
        </div>
        <button type="submit" className="btn !px-4 !py-2">Filtrar</button>
      </form>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Cuándo</th>
              <th className="py-3 pr-4 font-normal">Quién</th>
              <th className="py-3 pr-4 font-normal">Acción</th>
              <th className="py-3 font-normal">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-line align-top">
                <td className="mono py-3 pr-4">{when.format(a.createdAt)}</td>
                <td className="py-3 pr-4">{a.userName ?? "sistema"}</td>
                <td className="py-3 pr-4">
                  <span className="mono text-accent-ink">{a.action}</span>
                  <p className="mono break-all text-muted">{a.entity}{a.entityId ? ` · ${a.entityId}` : ""}</p>
                </td>
                <td className="py-3">
                  {a.diff ? (
                    <details>
                      <summary className="mono cursor-pointer text-muted">Ver</summary>
                      <pre className="mono mt-2 max-w-[28rem] overflow-x-auto whitespace-pre-wrap text-muted">{JSON.stringify(a.diff, null, 2)}</pre>
                    </details>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">No hay registros con esos filtros.</p>}
      </div>

      {pages > 1 && (
        <nav className="mono mt-8 flex items-center gap-4" aria-label="Paginación">
          {page > 1 && <Link href={`/admin/auditoria?${qs(page - 1)}`}>← Anterior</Link>}
          <span className="text-muted">Página {page} de {pages}</span>
          {page < pages && <Link href={`/admin/auditoria?${qs(page + 1)}`}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
