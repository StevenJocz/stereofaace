import { Suspense } from "react";
import { endSession, requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { AdminSidebar } from "@/ui/admin/AdminSidebar";
import { ADMIN_NAV } from "@/ui/admin/nav";

async function logoutAction() {
  "use server";
  await endSession();
  redirect("/admin/login");
}

/** Comprueba la sesión en el servidor en cada petición. Sin sesión válida redirige al inicio de sesión. */
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const groups = ADMIN_NAV.map((g) => ({
    group: g.group,
    items: g.items.filter((i) => can(user.role, i.permission)).map(({ href, label }) => ({ href, label })),
  })).filter((g) => g.items.length > 0);
  return (
    <div className="adm-shell">
      <AdminSidebar groups={groups} email={user.email} role={user.role} logout={logoutAction} />
      <main className="adm-main">
        <div className="wrap py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="adm-shell" aria-busy="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
