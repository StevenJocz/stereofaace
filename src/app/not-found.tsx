import type { Metadata } from "next";
import { Footer } from "@/ui/Footer";
import { Header } from "@/ui/Header";
import { NotFoundView } from "@/ui/NotFoundView";

export const metadata: Metadata = { title: "404 · Señal perdida", robots: { index: false, follow: false } };

/** Cualquier dirección que no existe en el sitio. Fuera del grupo público, así que trae su propia cabecera y pie. */
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="contenido">
        <NotFoundView />
      </main>
      <Footer />
    </>
  );
}
