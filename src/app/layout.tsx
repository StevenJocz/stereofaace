import type { Metadata } from "next";
import { Archivo, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { RadioProvider } from "@/ui/radio/RadioProvider";
import { RadioBar } from "@/ui/radio/RadioBar";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  style: ["normal", "italic"],
  display: "swap",
});
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  // Solo se usa en el cuerpo de los artículos: no se precarga en el resto de páginas.
  preload: false,
});
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { types: { "application/rss+xml": "/rss.xml" } },
  title: "StereoFace — electrónica, indie y cultura underground",
  description:
    "Plataforma cultural donde la música electrónica, el indie, el arte, la tecnología y la escena underground se encuentran.",
};

// Se ejecuta antes del primer pintado: evita parpadeo de tema y de estados de animación.
// Si el movimiento no arranca en 6 s (JS bloqueado o roto) se desactiva y todo el contenido queda visible.
const bootScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem('sf-theme');if(t==='light'||t==='dark')d.dataset.theme=t;}catch(e){}
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){d.classList.add('motion-ok');
try{if(location.pathname==='/'&&!sessionStorage.getItem('sf-intro'))d.classList.add('intro-on');}catch(e){}
setTimeout(function(){if(!window.__sfMotion){d.classList.remove('motion-ok');d.classList.remove('intro-on');}},6000);}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-theme="dark"
      suppressHydrationWarning
      className={`${archivo.variable} ${jetbrains.variable} ${newsreader.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body>
        {/* El reproductor vive en el layout raíz: no se desmonta al navegar, así la radio no se corta. */}
        <RadioProvider>
          {children}
          <RadioBar />
        </RadioProvider>
      </body>
    </html>
  );
}
