import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { listPublicArtists } from "@/modules/artists/profile";
import { Art } from "@/ui/Art";
import { StereoImage } from "@/ui/StereoImage";

export const metadata: Metadata = {
  title: "Artistas y bandas · StereoFace",
  description: "Perfiles de artistas y bandas de electrónica, indie y rock: biografía, lanzamientos, próximas fechas y noticias.",
  alternates: { canonical: `${SITE_URL}/artistas` },
};

async function ArtistList() {
  await connection();
  const items = await listPublicArtists(await getDb());
  if (items.length === 0) return <p className="mt-8 text-muted">Todavía no hay artistas publicados.</p>;
  return (
    <ul className="grid12 mt-10 gap-y-10">
      {items.map((a) => {
        const c = a.coverArt ?? { scene: "wave" as const, tone: "acid" as const, seed: 7 };
        return (
          <li key={a.slug} className="stereo-host hover-host col-span-6 md:col-span-4 lg:col-span-3">
            <div className="relative">
              <StereoImage ratio="3 / 4">
                {a.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por /media
                  <img src={a.imageUrl} alt={a.name} className="size-full object-cover" loading="lazy" />
                ) : (
                  <Art scene={c.scene} tone={c.tone} seed={c.seed} />
                )}
              </StereoImage>
              {a.isDemo && <span className="tag tag-demo absolute left-2 top-2 z-10">Demo</span>}
              {a.country && <span className="tag tag-fill absolute bottom-2 left-2 z-10">{a.country}</span>}
            </div>
            <h2 className="display-up mt-3 text-[1.25rem]">
              <Link href={`/artistas/${a.slug}`} className="stretch">
                <span className="sweep">{a.name}</span>
              </Link>
            </h2>
            {a.genre && <p className="mono muted">{a.genre}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export default function ArtistsIndexPage() {
  return (
    <div className="wrap pt-8">
      <nav aria-label="Migas de pan" className="mono text-muted">
        <Link href="/" className="hover:text-accent-ink">
          Inicio
        </Link>{" "}
        / Artistas y bandas
      </nav>
      <h1 className="display mt-6 text-[clamp(2.4rem,6vw,5.5rem)]">Artistas y bandas</h1>
      <p className="mt-4 max-w-[60ch] text-muted">
        Entra a cada perfil para ver su biografía, lanzamientos, próximas fechas y las noticias en las que aparece.
      </p>
      <Suspense fallback={<div className="h-[50vh]" aria-busy="true" />}>
        <ArtistList />
      </Suspense>
    </div>
  );
}
