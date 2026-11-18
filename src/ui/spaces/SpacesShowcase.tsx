import Link from "next/link";
import type { SpaceCard } from "@/modules/spaces/public";

const STEPS: [string, string][] = [
  ["01", "Elige tu nombre"],
  ["02", "Tu música"],
  ["03", "Tu estilo"],
];

/**
 * Banda de la portada que muestra Spaces reales y invita a crear el propio. Sin perfiles todavía, no inventa ninguno:
 * muestra solo la invitación (la tarjeta «Tu Space aquí»).
 */
export function SpacesShowcase({ cards, total, signedIn }: { cards: SpaceCard[]; total: number; signedIn: boolean }) {
  const cta = signedIn ? { href: "/spaces/editar", label: "Ir a mi Space" } : { href: "/spaces/registro", label: "Crear mi Space — es gratis" };
  return (
    <section id="spaces" aria-labelledby="spaces-h" className="spx scroll-mt-16">
      <p className="spx-ghost" aria-hidden="true">
        SPACES
      </p>
      <div className="wrap spx-inner">
        <div className="spx-copy" data-reveal>
          <p className="mono text-accent-ink">StereoFace Spaces</p>
          <h2 id="spaces-h" className="display-up spx-title">
            Tu espacio.
            <br />
            Tu sonido.
            <br />
            <span className="text-accent-ink">Tu identidad.</span>
          </h2>
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
          {total > 0 && (
            <p className="spx-count mono">
              <span className="spx-dot" aria-hidden="true" />
              {total === 1 ? "1 persona ya tiene su Space" : `${new Intl.NumberFormat("es-CO").format(total)} personas ya tienen su Space`}
            </p>
          )}
        </div>

        <ul className="spx-cards" aria-label="Spaces de la comunidad">
          {cards.map((s, i) => (
            <li key={s.username} data-reveal data-delay={Math.min(i, 5) * 0.07} style={{ ["--tilt" as string]: `${[-2.2, 1.6, -1, 2.4, -1.8, 1.2][i % 6]}deg` }}>
              <Link href={`/@${s.username}`} className="spx-card">
                <span className="spx-avatar">
                  {s.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s
                    <img src={s.avatarUrl} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">{s.displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                </span>
                {s.featured && <span className="spx-star mono">★ Destacado</span>}
                <span className="display-up spx-user">@{s.username}</span>
                {s.tagline ? <span className="spx-tag">{s.tagline}</span> : <span className="spx-tag">{s.displayName}</span>}
                {s.genres.length > 0 && (
                  <span className="spx-genres">
                    {s.genres.map((g) => (
                      <span key={g}>{g}</span>
                    ))}
                  </span>
                )}
              </Link>
            </li>
          ))}
          <li data-reveal style={{ ["--tilt" as string]: "1.4deg" }}>
            <Link href={cta.href} className="spx-card spx-invite">
              <span className="spx-plus" aria-hidden="true">
                +
              </span>
              <span className="display-up spx-user">{signedIn ? "Tu Space" : "Tu Space aquí"}</span>
              <span className="spx-tag">{signedIn ? "Edítalo cuando quieras." : "Crea el tuyo en dos minutos."}</span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
