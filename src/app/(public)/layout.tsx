import { Suspense } from "react";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { getAdsConfig } from "@/modules/settings/ads";
import { AdsBridge } from "@/ui/ads/AdsBridge";
import { Header } from "@/ui/Header";
import { Footer } from "@/ui/Footer";
import { MotionRoot } from "@/ui/MotionRoot";
import { Intro } from "@/ui/Intro";
import { CabinLive } from "@/ui/cabin/CabinLive";

/** Lee la configuración de publicidad en cada petición; si falla, no hay anuncios. */
async function AdsLoader() {
  await connection();
  let config = null;
  try {
    config = await getAdsConfig(await getDb());
  } catch (error) {
    console.error("[ads] no se pudo leer la configuración", error);
  }
  return config ? <AdsBridge config={config} /> : null;
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Intro />
      <a href="#contenido" className="skip">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido">{children}</main>
      <Footer />
      <CabinLive />
      <MotionRoot />
      <Suspense fallback={null}>
        <AdsLoader />
      </Suspense>
    </>
  );
}
