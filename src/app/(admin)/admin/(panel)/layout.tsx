import { Suspense } from "react";
import Link from "next/link";
import { endSession, requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { Mark } from "@/ui/Header";
import { ADMIN_NAV } from "@/ui/admin/nav";

async function logoutAction() {
  "use server";
  await endSession();
  redirect("/admin/login");
}

/** Comprueba la sesión en el servidor en cada petición. Sin sesión válida redirige al inicio de sesión. */
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="border-b border-line">
        <div className="wrap flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 sm:gap-x-6">
            <Link href="/admin" className="flex items-center gap-3" aria-label="Administración, inicio">
              <Mark size={30} />
              <span className="display-wide hidden text-[1.05rem] min-[380px]:inline">
                Stereo<span className="text-accent-ink">Face</span>
              </span>
              <span className="tag">Admin</span>
            </Link>
            <nav
              aria-label="Administración"
              className="mono order-3 flex w-full flex-wrap items-center gap-x-6 gap-y-2 pb-1 sm:order-none sm:w-auto sm:pb-0"
            >
              <Link href="/admin" className="hover:text-accent-ink">
                Panel
              </Link>
              {ADMIN_NAV.map((g) => {
                const items = g.items.filter((i) => can(user.role, i.permission));
                if (items.length === 0) return null;
                return (
                  <div key={g.group} className="flex items-center gap-3">
                    <span className="text-muted">{g.group}</span>
                    {items.map((i) => (
                      <Link key={i.href} href={i.href} className="whitespace-nowrap hover:text-accent-ink">
                        {i.label}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="mono max-w-[14rem] truncate text-right text-muted sm:max-w-[18rem]">
              {user.email}
              <br />
              <span className="text-accent-ink">{user.role}</span>
            </p>
            <form action={logoutAction}>
              <button type="submit" className="btn !px-4 !py-2">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="wrap py-6 sm:py-10">{children}</main>
    </>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="wrap py-10" aria-busy="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
