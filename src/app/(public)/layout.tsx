import { Header } from "@/ui/Header";
import { Footer } from "@/ui/Footer";
import { MotionRoot } from "@/ui/MotionRoot";
import { Intro } from "@/ui/Intro";

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
      <MotionRoot />
    </>
  );
}
