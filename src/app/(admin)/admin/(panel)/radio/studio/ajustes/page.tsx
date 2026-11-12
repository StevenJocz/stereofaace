import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getAutodjStatus, getRelayConfig } from "@/modules/studio/relay";
import { getStudioConfig } from "@/modules/studio/settings";
import { PageHead } from "@/ui/admin/fields";
import { RelaySettingsForm, StudioSettingsForm } from "@/ui/studio/StudioSettingsForm";

export default async function StudioSettingsPage() {
  const user = await requirePermission("station:manage");
  const db = await getDb();
  const [config, relay, autodj] = await Promise.all([getStudioConfig(db, user), getRelayConfig(db, user), getAutodjStatus(db, user)]);
  return (
    <>
      <PageHead eyebrow="StereoFace Radio" title="Ajustes del estudio" />
      <p className="mt-3 max-w-[70ch] text-muted">
        Conecta el estudio con tu AzuraCast para usar su biblioteca de música. La clave solo la lee el servidor de
        StereoFace.
      </p>
      <div className="mt-8">
        <StudioSettingsForm initial={config} />
      </div>
      <h2 className="display-up mt-12 text-[1.4rem]">Señal externa</h2>
      <p className="mt-2 max-w-[70ch] text-muted">
        Retransmite una radio con autorización (por ejemplo Trance Is Star Radio): se puede mezclar desde el estudio y, si quieres, sonar sola en el AutoDJ
        mientras no hay música. Usa solo señales que tengan permiso de retransmisión.
      </p>
      <div className="mt-6">
        <RelaySettingsForm initial={relay} />
      </div>
      <h3 className="display-up mt-10 text-[1.15rem]">Estado del AutoDJ en AzuraCast</h3>
      {!autodj.hasKey ? (
        <p className="mt-2 text-muted">Guarda la clave API de AzuraCast para ver aquí qué listas están activas.</p>
      ) : autodj.error ? (
        <p role="alert" className="mono mt-2 text-[var(--violet)]">
          No se pudo leer AzuraCast: {autodj.error}
        </p>
      ) : (
        <ul className="mt-3 grid max-w-[60ch] gap-1.5">
          {autodj.lists.map((l) => (
            <li key={l.name} className="flex items-center justify-between gap-3 rounded-[8px] border border-line px-3 py-2">
              <span className="min-w-0 truncate font-bold">{l.name}</span>
              <span className="mono flex shrink-0 items-center gap-2 text-[0.7rem]">
                <span className="text-muted">{l.kind}</span>
                <span className={l.enabled ? "badge badge-ok" : "badge"}>{l.enabled ? "Activa" : "Pausada"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
