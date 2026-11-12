import { getDb } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { getStudioConfig } from "@/modules/studio/settings";
import { PageHead } from "@/ui/admin/fields";
import { StudioSettingsForm } from "@/ui/studio/StudioSettingsForm";

export default async function StudioSettingsPage() {
  const user = await requirePermission("station:manage");
  const config = await getStudioConfig(await getDb(), user);
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
    </>
  );
}
