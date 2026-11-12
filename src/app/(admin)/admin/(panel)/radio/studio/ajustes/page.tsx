import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getRelayConfig } from "@/modules/studio/relay";
import { getStudioConfig } from "@/modules/studio/settings";
import { PageHead } from "@/ui/admin/fields";
import { RelaySettingsForm, StudioSettingsForm } from "@/ui/studio/StudioSettingsForm";

export default async function StudioSettingsPage() {
  const user = await requirePermission("station:manage");
  const db = await getDb();
  const [config, relay] = await Promise.all([getStudioConfig(db, user), getRelayConfig(db, user)]);
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
    </>
  );
}
