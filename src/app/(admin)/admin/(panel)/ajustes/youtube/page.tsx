import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getVideoAdmin } from "@/modules/video/service";
import { PageHead } from "@/ui/admin/fields";
import { YoutubeSettingsForm } from "@/ui/admin/YoutubeSettingsForm";

export default async function YoutubeSettingsPage({ searchParams }: { searchParams: Promise<{ conectado?: string; error?: string }> }) {
  const user = await requirePermission("audit:manage"); // solo superadministrador
  const [view, sp] = await Promise.all([getVideoAdmin(await getDb(), user), searchParams]);
  return (
    <>
      <PageHead eyebrow="Sistema" title="YouTube" />
      <p className="mt-4 max-w-[70ch] text-muted">
        Conecta una sola vez el canal oficial de YouTube de StereoFace. Los locutores transmiten la cámara de la cabina desde el administrador, sin claves: el servidor
        la envía a YouTube y el sitio muestra el directo con el reproductor oficial, siempre sin audio.
      </p>
      {sp.conectado && <p role="status" className="mono mt-4 text-accent-ink">Canal conectado.</p>}
      {sp.error && <p role="alert" className="mono mt-4 text-[#ff8a8a]">{sp.error}</p>}
      <div className="mt-8">
        <YoutubeSettingsForm connected={view.connected} channelTitle={view.channelTitle} privacy={view.privacy} envMissing={view.envMissing} />
      </div>
    </>
  );
}
