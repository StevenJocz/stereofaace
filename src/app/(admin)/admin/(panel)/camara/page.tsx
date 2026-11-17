import { requirePermission } from "@/lib/auth/session";
import { PageHead } from "@/ui/admin/fields";
import { CabinCamera } from "@/ui/studio/CabinCamera";

export default async function CameraPage() {
  await requirePermission("studio:update");
  return (
    <>
      <PageHead eyebrow="Radio" title="Cámara en cabina" />
      <p className="muted mt-2 max-w-2xl">Transmite el video de la cabina al canal de YouTube de StereoFace. Solo video: el audio es siempre el de la radio.</p>
      <div className="mt-8">
        <CabinCamera />
      </div>
    </>
  );
}
