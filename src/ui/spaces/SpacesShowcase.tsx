import Link from "next/link";
import type { Network } from "@/modules/spaces/public";
import { SpacesNetwork } from "./SpacesNetwork";
import { Crosshair, TopoLines } from "./TopoLines";

const STEPS: [string, string][] = [
  ["01", "Elige tu nombre"],
  ["02", "Tu música"],
  ["03", "Tu estilo"],
];

/**
 * Banda de la portada: red animada de Spaces reales (y sus seguimientos) que invita a crear el propio. Sin perfiles todavía,
 * no inventa ninguno: muestra solo la invitación y espacios libres.
 */
export function SpacesShowcase({ network, signedIn }: { network: Network; signedIn: boolean }) {
  const cta = signedIn ? { href: "/spaces/editar", label: "Ir a mi Space" } : { href: "/spaces/registro", label: "Crear mi Space — es gratis" };
  return (
    <section id="spaces" aria-labelledby="spaces-h" className="spx scroll-mt-16">
      <p className="spx-ghost" aria-hidden="true">
        SPACES
      </p>
      <div className="wrap spx-inner">
        <div className="spx-copy" data-reveal>
          <p className="mono text-accent-ink">StereoFace Spaces</p>
          <div className="spx-art">
            <TopoLines />
            <Crosshair />
            <h2 id="spaces-h" className="spx-title">
              Tu espacio.
              <br />
              Tu sonido.
              <br />
              Tu identidad.
            </h2>
          </div>
          <p className="spx-lead">Un perfil propio dentro de StereoFace: tus géneros, tus artistas, tu estilo y la radio como banda sonora. Personalízalo a tu manera y deja que la comunidad te encuentre.</p>
          <ol className="spx-steps" aria-label="Cómo se crea un Space">
            {STEPS.map(([n, label]) => (
              <li key={n}>
                <span className="mono">{n}</span> {label}
              </li>
            ))}
          </ol>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href={cta.href} className="btn btn-accent">
              {cta.label}
            </Link>
            <Link href="/spaces" className="btn">
              Explorar Spaces →
            </Link>
          </div>
          {network.total > 0 && (
            <p className="spx-count mono">
              <span className="spx-dot" aria-hidden="true" />
              {network.total === 1 ? "1 persona ya tiene su Space" : `${new Intl.NumberFormat("es-CO").format(network.total)} personas ya tienen su Space`}
            </p>
          )}
        </div>

        <div data-reveal data-delay="0.1">
          <SpacesNetwork network={network} ctaHref={cta.href} />
        </div>
      </div>
    </section>
  );
}
