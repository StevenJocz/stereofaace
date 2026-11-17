import Link from "next/link";
import { Barcode } from "./Barcode";

const LINKS = [
  { href: "/", label: "Volver al inicio", primary: true },
  { href: "/noticias", label: "Últimas noticias" },
  { href: "/artistas", label: "Artistas" },
  { href: "/cabina", label: "Cabina en vivo" },
];

/** Línea de señal plana con un par de picos: la «frecuencia» que se perdió. */
function Flatline() {
  return (
    <svg className="nf-wave" viewBox="0 0 600 60" preserveAspectRatio="none" role="presentation" aria-hidden="true">
      <path d="M0 30 H210 L222 8 L236 52 L248 18 L258 30 H600" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Página 404: «señal perdida». Mismo lenguaje de StereoFace (negro, verde ácido, violeta, mono) con ruido y canal estéreo partido. */
export function NotFoundView() {
  return (
    <section className="nf wrap" aria-labelledby="nf-title">
      <div className="nf-noise" aria-hidden="true" />
      <p className="mono text-accent-ink">Error 404 · Frecuencia no encontrada</p>

      <p className="nf-code display-wide" aria-hidden="true">
        <span data-text="404">404</span>
      </p>

      <h1 id="nf-title" className="display-up nf-title">
        Señal perdida
      </h1>
      <p className="muted mt-3 max-w-[46ch] text-[1.02rem]">
        Esta página se perdió entre el ruido. Quizá la movimos, quizá nunca existió. Vuelve a sintonizar: la radio sigue sonando.
      </p>

      <Flatline />

      <ul className="mt-8 flex flex-wrap gap-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={l.primary ? "btn btn-accent" : "btn"}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="nf-foot" aria-hidden="true">
        <Barcode value="404-SIN-SENAL" className="h-8 w-40 text-fg" />
        <span className="mono muted">CH-L ▮▮▮▯▯ · CH-R ▯▯▮▮▮ · sin portadora</span>
      </div>
    </section>
  );
}
