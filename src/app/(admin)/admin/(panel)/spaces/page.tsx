import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listGenreOptionsAdmin, listReports, listSpacesAdmin, listThemesAdmin } from "@/modules/spaces/moderation";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { AddGenreForm } from "@/ui/admin/SpacesAdminForms";
import { closeReportAction, disableAction, featureAction, genreActiveAction, themeActiveAction } from "./actions";

const STATUS: Record<string, string> = { draft: "Borrador", published: "Publicado", disabled: "Desactivado" };
const day = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

export default async function SpacesAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string }> }) {
  const user = await requirePermission("space:read");
  const sp = await searchParams;
  const db = await getDb();
  const [list, reports, genres, themes] = await Promise.all([listSpacesAdmin(db, user, { q: sp.q, status: sp.estado }), listReports(db, user), listGenreOptionsAdmin(db, user), listThemesAdmin(db, user)]);
  const manage = can(user.role, "space:manage");
  return (
    <>
      <PageHead eyebrow="Audiencia" title="StereoFace Spaces" />
      <p className="mt-3 max-w-[70ch] text-muted">Perfiles de la comunidad: búsqueda, destacados, desactivación de los que incumplen las normas, reportes, géneros y plantillas.</p>

      <section className="mt-10" aria-labelledby="reportes-h">
        <h2 id="reportes-h" className="display t-s">Reportes abiertos ({reports.length})</h2>
        {reports.length === 0 ? (
          <p className="mt-3 text-muted">No hay reportes pendientes.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {reports.map((r) => (
              <li key={r.id} className="panel flex flex-wrap items-center justify-between gap-3 p-3">
                <span>
                  <Link href={`/@${r.username}?vista=borrador`} className="font-bold hover:text-accent-ink">@{r.username}</Link>
                  <span className="mono muted block text-[0.72rem]">
                    {r.reason} · {day.format(r.createdAt)}
                  </span>
                  {r.detail && <span className="block text-[0.9rem]">{r.detail}</span>}
                </span>
                <span className="flex flex-wrap gap-2">
                  <RowAction action={disableAction} fields={{ id: r.userId, value: "1", reason: `reporte: ${r.reason}` }} label="Desactivar perfil" />
                  <RowAction action={closeReportAction} fields={{ id: r.id }} label="Cerrar reporte" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="perfiles-h">
        <h2 id="perfiles-h" className="display t-s">Perfiles ({list.total})</h2>
        <form className="mt-4 flex flex-wrap items-end gap-3" role="search">
          <label className="block">
            <span className="mono muted block">Buscar</span>
            <input name="q" defaultValue={sp.q ?? ""} className="input" placeholder="usuario, nombre o correo" maxLength={60} />
          </label>
          <label className="block">
            <span className="mono muted block">Estado</span>
            <select name="estado" defaultValue={sp.estado ?? ""} className="input">
              <option value="">Todos</option>
              {Object.entries(STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">Filtrar</button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="mono border-b border-line text-muted">
                <th className="py-2 pr-4 font-normal">Perfil</th>
                <th className="py-2 pr-4 font-normal">Estado</th>
                <th className="py-2 pr-4 font-normal">Alta</th>
                <th className="py-2 font-normal">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {list.rows.map((r) => (
                <tr key={r.userId} className="border-b border-line align-top">
                  <td className="py-3 pr-4">
                    <Link href={`/@${r.username}?vista=borrador`} className="font-bold hover:text-accent-ink">@{r.username}</Link>
                    <p className="mono muted break-all text-[0.72rem]">{r.displayName} · {r.email}{r.verified ? "" : " · sin confirmar"}</p>
                    {r.openReports > 0 && <p className="mono text-[#ffb020] text-[0.72rem]">{r.openReports} reporte(s) abierto(s)</p>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="badge">{STATUS[r.status] ?? r.status}</span>
                    {r.featured && <span className="badge badge-ok ml-1">Destacado</span>}
                  </td>
                  <td className="mono py-3 pr-4">{day.format(new Date(r.createdAt))}</td>
                  <td className="py-3">
                    <span className="flex flex-wrap gap-2">
                      {r.status === "published" && <RowAction action={featureAction} fields={{ id: r.userId, value: r.featured ? "0" : "1" }} label={r.featured ? "Quitar destacado" : "Destacar"} />}
                      {r.status === "disabled" ? (
                        <RowAction action={disableAction} fields={{ id: r.userId, value: "0" }} label="Reactivar" />
                      ) : (
                        <RowAction action={disableAction} fields={{ id: r.userId, value: "1", reason: "decisión de la administración" }} label="Desactivar" />
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {list.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-muted">Ningún perfil coincide.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12 grid gap-10 lg:grid-cols-2">
        <div aria-labelledby="generos-h">
          <h2 id="generos-h" className="display t-s">Géneros</h2>
          <ul className="mt-4 grid gap-1.5">
            {genres.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-line px-3 py-1.5">
                <span>{g.name} <span className="mono muted text-[0.7rem]">{g.slug}</span></span>
                {manage && <RowAction action={genreActiveAction} fields={{ id: g.id, value: g.active ? "0" : "1" }} label={g.active ? "Ocultar" : "Mostrar"} />}
              </li>
            ))}
          </ul>
          {manage && <div className="mt-4"><AddGenreForm /></div>}
        </div>
        <div aria-labelledby="plantillas-h">
          <h2 id="plantillas-h" className="display t-s">Plantillas</h2>
          <ul className="mt-4 grid gap-1.5">
            {themes.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-line px-3 py-1.5">
                <span>{t.name}<span className="mono muted block text-[0.7rem]">{t.description}</span></span>
                {manage && <RowAction action={themeActiveAction} fields={{ id: t.id, value: t.active ? "0" : "1" }} label={t.active ? "Desactivar" : "Activar"} />}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
