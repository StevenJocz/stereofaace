import { requirePermission } from "@/lib/auth/session";
import { PageHead } from "@/ui/admin/fields";
import { StudioConsole } from "@/ui/studio/StudioConsole";

export default async function StudioPage() {
  await requirePermission("station:update");
  return (
    <>
      <PageHead eyebrow="StereoFace Radio" title="Estudio en vivo" />
      <p className="mt-3 max-w-[70ch] text-muted">
        Transmite en vivo: mientras estés al aire suena tu mezcla; al terminar, la radio vuelve sola al AutoDJ. Deja
        esta pestaña abierta durante la emisión.
      </p>
      <div className="mt-6">
        <StudioConsole />
      </div>
    </>
  );
}
