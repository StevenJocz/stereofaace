import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { canAssignRole } from "@/lib/rbac";
import { ROLES } from "@/modules/users/schema";
import { PageHead } from "@/ui/admin/fields";
import { UserForm } from "@/ui/admin/UserForms";

export default async function NewUserPage() {
  const user = await requirePermission("user:create");
  const roles = ROLES.filter((r) => canAssignRole(user, r));
  return (
    <>
      <PageHead eyebrow="Sistema" title="Nuevo usuario" action={<Link href="/admin/usuarios" className="btn">← Usuarios</Link>} />
      <div className="mt-8">
        <UserForm initial={{ role: roles.includes("editor") ? "editor" : roles[0] }} roles={[...roles]} />
      </div>
    </>
  );
}
