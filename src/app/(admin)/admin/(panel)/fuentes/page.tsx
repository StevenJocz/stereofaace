import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listSourcesAdmin } from "@/modules/ingest/admin";
import { PageHead } from "@/ui/admin/fields";
import { KIND_LABEL } from "@/ui/admin/options";

const day = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

export default async function SourcesAdminPage({ searchParams }: { searchParams: Promise<{ borrada?: string }> }) {
  const user = await requirePermission("source:read");
  const [items, sp] = await Promise.all([listSourcesAdmin(await getDb(), user), searchParams]);
  return (
    <>
      <PageHead
        eyebrow="Sistema"
        title="Fuentes de noticias"
        action={
          can(user.role, "source:create") && (
            <Link href="/admin/fuentes/nuevo" className="btn btn-accent">
              Nueva fuente
            </Link>
          )
        }
      />
      {sp.borrada && <p role="status" className="mono mt-4 text-accent-ink">Fuente borrada.</p>}
      <p className="mt-4 max-w-[70ch] text-muted">
        Registro de fuentes externas. Todas nacen desactivadas y solo se pueden activar después de verificar sus
        términos y licencia. Por ahora no se ejecuta ninguna ingesta automática.
      </p>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Fuente</th>
              <th className="py-3 pr-4 font-normal">Tipo</th>
              <th className="py-3 pr-4 font-normal">Términos</th>
              <th className="py-3 font-normal">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <Link href={`/admin/fuentes/${s.id}`} className="display-up hover:text-accent-ink">{s.name}</Link>
                  <p className="mono break-all text-muted">{s.url}</p>
                </td>
                <td className="mono py-3 pr-4">{KIND_LABEL[s.kind] ?? s.kind}</td>
                <td className="py-3 pr-4">
                  {s.termsVerifiedAt ? <span className="badge badge-ok">Verificados {day.format(s.termsVerifiedAt)}</span> : <span className="badge badge-warn">Sin verificar</span>}
                </td>
                <td className="py-3">{s.active ? <span className="badge badge-ok">Activa</span> : <span className="badge badge-idle">Desactivada</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">Todavía no hay fuentes registradas.</p>}
      </div>
    </>
  );
}
