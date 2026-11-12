import Link from "next/link";
import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/rbac";
import { listStationsAdmin } from "@/modules/radio/service";

const KIND: Record<string, string> = { hls: "HLS", direct: "Directo", embed: "Incrustado" };

function AuthBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending: ["badge-warn", "Pendiente"],
    granted: ["badge-ok", "Concedida"],
    denied: ["badge-bad", "Denegada"],
    not_required: ["badge-idle", "No requerida"],
  };
  const [cls, label] = map[status] ?? ["badge-idle", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default async function RadioAdminPage({ searchParams }: { searchParams: Promise<{ borrada?: string }> }) {
  const user = await requirePermission("station:read");
  const [stations, sp] = await Promise.all([listStationsAdmin(await getDb(), user), searchParams]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono text-accent-ink">StereoFace Frequencies</p>
          <h1 className="display t-l mt-1">Emisoras</h1>
        </div>
        {can(user.role, "station:create") && (
          <Link href="/admin/radio/new" className="btn btn-accent">
            Nueva emisora
          </Link>
        )}
      </div>

      {sp.borrada && (
        <p role="status" className="mono mt-4 text-accent-ink">
          Emisora borrada.
        </p>
      )}

      <p className="mt-4 max-w-[70ch] text-muted">
        Una emisora solo aparece en el reproductor si está <strong>activada</strong> y tiene la autorización de
        retransmisión <strong>concedida</strong> (o no requerida). La señal se reproduce directamente desde su origen en
        el navegador de cada persona; este servidor no la descarga, almacena ni retransmite.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="mono border-b border-line text-muted">
              <th className="py-3 pr-4 font-normal">Emisora</th>
              <th className="py-3 pr-4 font-normal">Tipo</th>
              <th className="py-3 pr-4 font-normal">País</th>
              <th className="py-3 pr-4 font-normal">Autorización</th>
              <th className="py-3 pr-4 font-normal">Estado</th>
              <th className="py-3 font-normal">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.id} className="border-b border-line hover:bg-accent/5">
                <td className="py-4 pr-4">
                  <p className="font-semibold">{s.name}</p>
                  <p className="mono text-muted">
                    {s.slug}
                    {s.isDemo ? " · demo" : ""}
                  </p>
                </td>
                <td className="mono py-4 pr-4">{KIND[s.streamKind]}</td>
                <td className="mono py-4 pr-4">{s.country ?? "—"}</td>
                <td className="py-4 pr-4">
                  <AuthBadge status={s.authorizationStatus} />
                </td>
                <td className="py-4 pr-4">
                  <span className={`badge ${s.enabled ? "badge-ok" : "badge-idle"}`}>
                    {s.enabled ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="py-4 text-right">
                  <Link href={`/admin/radio/${s.id}`} className="btn !px-4 !py-2">
                    Abrir
                  </Link>
                </td>
              </tr>
            ))}
            {stations.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted">
                  Aún no hay emisoras.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
