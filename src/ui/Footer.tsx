import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Barcode } from "./Barcode";
import { Mark } from "./Header";
import { getDb } from "@/lib/db";
import { EDITION_NO } from "@/lib/site";
import { DEFAULT_SITE_SETTINGS, getSiteSettings, type SiteSettings } from "@/modules/settings/site";

const SOCIAL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  x: "X",
};

/** El pie lee sus textos editables de la base de datos; mientras llegan (o si falla) se ve el texto predeterminado. */
export function Footer() {
  return (
    <Suspense fallback={<FooterView settings={DEFAULT_SITE_SETTINGS} />}>
      <FooterWithSettings />
    </Suspense>
  );
}

async function FooterWithSettings() {
  await connection();
  let settings = DEFAULT_SITE_SETTINGS;
  try {
    settings = await getSiteSettings(await getDb());
  } catch (error) {
    console.error("[footer] no se pudieron leer los ajustes", error);
  }
  return <FooterView settings={settings} />;
}

function FooterView({ settings }: { settings: SiteSettings }) {
  const social = Object.entries(settings.social).filter(([, url]) => !!url) as [string, string][];
  return (
    <footer className="mt-32 border-t border-line">
      <div className="wrap py-10">
        <div className="grid12 items-center gap-y-8">
          <div className="col-span-12 flex items-center gap-4 lg:col-span-4">
            <span className="shrink-0">
              <Mark size={64} />
            </span>
            <p className="display-wide text-[clamp(1.8rem,3.2vw,3.2rem)]">
              Stereo<span className="text-accent-ink">Face</span>
            </p>
          </div>

          <div className="col-span-12 md:col-span-5 lg:col-span-4">
            <p className="mono muted mb-3 flex items-center gap-3">
              Música <span className="opacity-40">/</span> Cultura <span className="opacity-40">/</span> Escena{" "}
              <span className="text-accent-ink">{"///"}</span>
            </p>
            <p className="max-w-[44ch] text-[0.95rem] text-muted">{settings.footer.text}</p>
            {social.length > 0 && (
              <p className="mono mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {social.map(([key, url]) => (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="hover:text-accent-ink">
                    {SOCIAL_LABEL[key] ?? key}
                  </a>
                ))}
              </p>
            )}
          </div>

          <nav aria-label="Secciones" className="mono col-span-6 flex flex-col gap-2 md:col-span-3 lg:col-span-2">
            <span className="muted">Secciones</span>
            <Link href="/#noticias">Noticias</Link>
            <Link href="/#lanzamientos">Lanzamientos</Link>
            <Link href="/#artistas">Artistas</Link>
            <Link href="/#agenda">Eventos</Link>
            <Link href="/#cultura">Cultura</Link>
          </nav>

          <div className="mono col-span-6 flex flex-col gap-2 md:col-span-4 lg:col-span-2">
            <span className="muted">Estado</span>
            <span>Contenido demo</span>
            <Barcode value={EDITION_NO} className="h-8 w-28" />
            <span className="muted">N.º {EDITION_NO}</span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden" aria-hidden="true">
        {/* Decoración: el texto va en un pseudo-elemento para que no cuente como contenido legible */}
        <p className="footer-mark select-none" data-text="StereoFace" data-parallax="0.05" suppressHydrationWarning />
      </div>

      <div className="wrap mono muted flex flex-wrap justify-between gap-2 border-t border-line py-4">
        <span>© 2026 StereoFace · Creado por Steven Jocz</span>
        <span>Colombia · Latinoamérica · Mundo</span>
      </div>
    </footer>
  );
}
