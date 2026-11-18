import { Suspense } from "react";
import { endSession, requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { getDb } from "@/lib/db";
import { getRelayPublic } from "@/modules/studio/relay";
import { djUsernameOf } from "@/modules/studio/dj-accounts";
import { AdminSidebar } from "@/ui/admin/AdminSidebar";
import { OnAirBar } from "@/ui/studio/OnAirBar";
import { PersistentStudio } from "@/ui/studio/PersistentStudio";
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
  const db = await getDb();
  // Todas las cuentas del equipo tienen acceso a su Space desde el administrador.
  groups.push({ group: "Mi cuenta", items: [{ href: "/spaces/editar", label: "Mi Space" }] });
  const relay = can(user.role, "studio:update") ? await getRelayPublic(db, user) : null;
  const locutor = user.role === "locutor" ? await djUsernameOf(db, user) : null;
  return (
    <div className="adm-shell">
      <AdminSidebar groups={groups} email={user.email} role={user.role} logout={logoutAction} />
      <main className="adm-main">
        <OnAirBar />
        <div className="wrap py-6 sm:py-8">
          {user.role === "locutor" && !locutor ? (
            <p role="alert" className="panel mono p-5 text-[#ffb020]">
              Tu cuenta aún no tiene usuario de DJ. Pide a quien administra que la sincronice con AzuraCast.
            </p>
          ) : (
            <>
              {children}
              {relay && <PersistentStudio relay={relay} locutor={locutor ?? undefined} />}
            </>
          )}
        </div>
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
