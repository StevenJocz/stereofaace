import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can, canAssignRole } from "@/lib/rbac";
import { listUsers } from "@/modules/users/admin";
import { ROLES } from "@/modules/users/schema";
import { PageHead } from "@/ui/admin/fields";
import { listProgramsAdmin } from "@/modules/schedule/service";
import { DjPanel, ResetPasswordForm, UserForm } from "@/ui/admin/UserForms";

export default async function EditUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string; aviso?: string }>;
}) {
  const me = await requirePermission("user:read");
  const { id } = await params;
  const [users, sp] = await Promise.all([listUsers(await getDb(), me), searchParams]);
  const target = users.find((u) => u.id === id);
  if (!target) notFound();
  const mayEdit = can(me.role, "user:update") && (target.id === me.id || canAssignRole(me, target.role));
  const roles = ROLES.filter((r) => canAssignRole(me, r));
  const programs =
    mayEdit && target.role === "locutor"
      ? (await listProgramsAdmin(await getDb(), me)).filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, djUsername: p.djUsername }))
      : [];

  return (
    <>
      <PageHead eyebrow="Sistema" title={target.name} action={<Link href="/admin/usuarios" className="btn">← Usuarios</Link>} />
      {sp.creado && <p role="status" className="mono mt-4 text-accent-ink">Usuario creado.</p>}
      {sp.aviso && <p role="alert" className="mono mt-2 text-[#ff8a8a]">AzuraCast: {sp.aviso} Usa «Sincronizar con AzuraCast» cuando esté arreglado.</p>}
      {!mayEdit && <p className="mono mt-4 text-muted">Tu rol no puede modificar a este usuario.</p>}
      <div className="mt-8">
        <UserForm
          readOnly={!mayEdit}
          roles={[...roles]}
          initial={{ id: target.id, email: target.email, name: target.name, role: target.role, active: target.active }}
        />
      </div>
      {mayEdit && target.role === "locutor" && (
        <div className="mt-12 border-t border-line pt-6">
          <h2 className="mono mb-3 text-muted">Locutor</h2>
          <DjPanel id={target.id} djUsername={target.djUsername} programs={programs} />
        </div>
      )}
      {mayEdit && (
        <div className="mt-12 border-t border-line pt-6">
          <h2 className="mono mb-3 text-muted">Contraseña</h2>
          <ResetPasswordForm id={target.id} />
        </div>
      )}
    </>
  );
}
