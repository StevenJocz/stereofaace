import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listUsers } from "@/modules/users/admin";
import { PageHead } from "@/ui/admin/fields";
import { ROLE_LABEL } from "@/ui/admin/options";

const day = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

export default async function UsersAdminPage() {
  const user = await requirePermission("user:read");
  const items = await listUsers(await getDb(), user);
  return (
    <>
      <PageHead
        eyebrow="Sistema"
        title="Usuarios"
        action={
          can(user.role, "user:create") && (
            <Link href="/admin/usuarios/nuevo" className="btn btn-accent">
              Nuevo usuario
            </Link>
          )
        }
      />
      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Usuario</th>
              <th className="py-3 pr-4 font-normal">Rol</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 font-normal">Alta</th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id} className="border-b border-line align-top">
                <td className="py-3 pr-4">
                  <Link href={`/admin/usuarios/${u.id}`} className="display-up hover:text-accent-ink">{u.name}</Link>
                  <p className="mono break-all text-muted">{u.email}</p>
                </td>
                <td className="mono py-3 pr-4">{ROLE_LABEL[u.role] ?? u.role}</td>
                <td className="py-3 pr-4">{u.active ? <span className="badge badge-ok">Activo</span> : <span className="badge badge-idle">Inactivo</span>}</td>
                <td className="mono py-3">{day.format(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
