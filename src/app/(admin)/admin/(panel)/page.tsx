import { Suspense } from "react";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { getDashboardStats } from "@/modules/dashboard/service";
import { ADMIN_NAV } from "@/ui/admin/nav";
import { PageHead } from "@/ui/admin/fields";
import { OnAirPanel } from "@/ui/admin/OnAirPanel";

const dateTime = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bogota",
});

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ denegado?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  // Algunos roles (colaborador) no ven cifras: solo el saludo y su navegación.
  const stats = can(user.role, "dashboard:read")
    ? await getDashboardStats(await getDb(), user)
    : null;
  const links = new Set(
    ADMIN_NAV.flatMap((g) =>
      g.items.filter((i) => can(user.role, i.permission)).map((i) => i.href),
    ),
  );

  const cards: {
    label: string;
    value: number;
    detail: string;
    href: string;
  }[] = !stats
    ? []
    : [
        {
          label: "Artículos",
          value: stats.articles.published,
          detail: `${stats.articles.draft} borradores · ${stats.articles.review} en revisión · ${stats.articles.scheduled} programados`,
          href: "/admin/articulos",
        },
        {
          label: "Artistas",
          value: stats.artists,
          detail: "En el catálogo",
          href: "/admin/artistas",
        },
        {
          label: "Lanzamientos",
          value: stats.releases,
          detail: "Publicados",
          href: "/admin/lanzamientos",
        },
        {
          label: "Eventos próximos",
          value: stats.eventsUpcoming,
          detail: "Publicados y por venir",
          href: "/admin/agenda",
        },
        {
          label: "Suscriptores",
          value: stats.subscribers.confirmed + stats.subscribers.pending,
          detail: `${stats.subscribers.pending} pendientes · ${stats.subscribers.unsubscribed} bajas`,
          href: "/admin/suscriptores",
        },
        {
          label: "Emisoras",
          value: stats.stations.total,
          detail: `${stats.stations.enabled} activas`,
          href: "/admin/radio",
        },
      ];

  return (
    <>
      <PageHead eyebrow="Administración" title="Panel" />
      <p className="mono mt-2 text-muted">Hola, {user.name}.</p>
      {sp.denegado && (
        <p role="alert" className="mono mt-4 text-[#ffb020]">
          Tu rol no tiene acceso a esa sección.
        </p>
      )}

      {can(user.role, "station:read") && (
        <Suspense fallback={<div className="panel mt-10 h-48 animate-pulse" aria-busy="true" />}>
          <OnAirPanel actor={user} />
        </Suspense>
      )}

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label} className="panel p-5">
            <p className="mono text-muted">{c.label}</p>
            <p className="display-cond mt-2 text-[3.5rem]">{c.value}</p>
            <p className="mono text-muted">{c.detail}</p>
            {links.has(c.href) && (
              <Link href={c.href} className="btn mt-4">
                Gestionar →
              </Link>
            )}
          </li>
        ))}
      </ul>

      {stats && can(user.role, "audit:read") && (
        <section className="mt-12" aria-labelledby="recent">
          <h2 id="recent" className="mono text-muted">
            Últimos cambios
          </h2>
          {stats.recentAudit.length === 0 ? (
            <p className="mt-3 text-muted">
              Todavía no hay actividad registrada.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {stats.recentAudit.map((a, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                >
                  <span>
                    <span className="mono text-accent-ink">{a.action}</span>{" "}
                    <span className="text-muted">
                      por {a.userName ?? "sistema"}
                    </span>
                  </span>
                  <time className="mono text-muted">
                    {dateTime.format(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
