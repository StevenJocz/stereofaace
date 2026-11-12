import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listPagesAdmin } from "@/modules/content/pages-admin";
import { PageHead } from "@/ui/admin/fields";
import { RowAction } from "@/ui/admin/RowAction";
import { pageStatusAction } from "./actions";

const when = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" });

export default async function PagesAdminPage({ searchParams }: { searchParams: Promise<{ borrada?: string }> }) {
  const user = await requirePermission("page:read");
  const [items, sp] = await Promise.all([listPagesAdmin(await getDb(), user), searchParams]);
  const canPublish = can(user.role, "page:publish");

  return (
    <>
      <PageHead
        eyebrow="Contenido"
        title="Páginas"
        action={
          can(user.role, "page:create") && (
            <Link href="/admin/paginas/nuevo" className="btn btn-accent">
              Nueva página
            </Link>
          )
        }
      />
      {sp.borrada && <p role="status" className="mono mt-4 text-accent-ink">Página borrada.</p>}
      <p className="mt-4 max-w-[70ch] text-muted">
        Páginas fijas (acerca de, contacto, términos…). Una vez publicadas viven en <span className="mono">/pagina/&lt;identificador&gt;</span>.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Página</th>
              <th className="py-3 pr-4 font-normal">Dirección</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 pr-4 font-normal">Actualizada</th>
              <th className="py-3 font-normal"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-line align-top">
                <td className="py-3 pr-4"><Link href={`/admin/paginas/${p.id}`} className="display-up hover:text-accent-ink">{p.title}</Link></td>
                <td className="mono py-3 pr-4">/pagina/{p.slug}</td>
                <td className="py-3 pr-4">{p.status === "published" ? <span className="badge badge-ok">Publicada</span> : <span className="badge badge-idle">Borrador</span>}</td>
                <td className="mono py-3 pr-4">{when.format(p.updatedAt)}</td>
                <td className="py-3 text-right">
                  {canPublish && (
                    <RowAction action={pageStatusAction} fields={{ id: p.id, status: p.status === "published" ? "draft" : "published" }} label={p.status === "published" ? "Despublicar" : "Publicar"} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="mt-6 text-muted">Todavía no hay páginas.</p>}
      </div>
    </>
  );
}
