import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { getAdsConfig } from "@/modules/settings/ads";
import { PageHead } from "@/ui/admin/fields";
import { AdsSettingsForm } from "@/ui/admin/AdsSettingsForm";

export default async function AdsSettingsPage() {
  await requirePermission("setting:update");
  const config = await getAdsConfig(await getDb());
  return (
    <>
      <PageHead eyebrow="Sistema" title="Publicidad" />
      <p className="mt-4 max-w-[70ch] text-muted">
        Prepara el sitio para Google AdSense. Mientras esté apagada no se muestra ningún anuncio ni el aviso de cookies. Al activarla, los anuncios solo se
        cargan si la persona los acepta en el aviso de cookies.
      </p>
      <div className="mt-8">
        <AdsSettingsForm initial={config} adsTxtUrl={`${SITE_URL}/ads.txt`} />
      </div>
      <h2 className="display-up mt-12 text-[1.2rem]">Antes de pedir la aprobación</h2>
      <ul className="mt-3 grid max-w-[70ch] list-disc gap-1.5 pl-5 text-muted">
        <li>Revisa y completa las páginas legales en Páginas (privacidad, cookies, términos, sobre nosotros y contacto). Añade en Contacto un correo propio.</li>
        <li>Publica contenido original: notas propias, entrevistas, reseñas y fotos propias o con licencia. Google rechaza sitios de contenido copiado o reescrito.</li>
        <li>Pide el alta en adsense.google.com con este dominio. Al aprobarte, Google te da el ID de editor (ca-pub-…) y el código de cada bloque de anuncios.</li>
        <li>Pega aquí el ID y los números de bloque, y activa la publicidad. Comprueba que {SITE_URL}/ads.txt responde.</li>
      </ul>
    </>
  );
}
