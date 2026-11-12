import type { ReactNode } from "react";
import type { CoverArt } from "@/modules/media/cover-art";
import { Art } from "./Art";
import { splitHeroTitle } from "./hero-copy";

/**
 * Cabecera de una nota o de un perfil con la misma estética que el carrusel de la portada: texto a la izquierda,
 * titular grande que se monta sobre la imagen a la derecha y la última línea en verde.
 * Si no hay foto se usa la ilustración generativa de la marca.
 */
export function StoryHero({
  crumbs,
  kicker,
  title,
  dek,
  meta,
  image,
  art,
  isDemo = false,
}: {
  /** Migas de pan ya maquetadas (enlaces). */
  crumbs: ReactNode;
  kicker?: string | null;
  title: string;
  dek?: string | null;
  /** Firma, fecha y tiempo de lectura (o país y géneros en un perfil). */
  meta?: ReactNode;
  image?: { src: string; alt: string; credit?: string | null } | null;
  art?: CoverArt | null;
  isDemo?: boolean;
}) {
  const lines = splitHeroTitle(title);
  const fallback = art ?? { scene: "wave" as const, tone: "acid" as const, seed: 7 };
  const credit = image?.credit ?? null;

  return (
    <div className="wrap pt-6">
      <section className="story-hero" aria-labelledby="story-title">
        <div className="story-hero-art">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto propia (/media) o de la fuente citada, con crédito visible
            <img
              src={image.src}
              alt={image.alt}
              className="size-full object-cover"
              referrerPolicy="no-referrer"
              fetchPriority="high"
            />
          ) : (
            <Art scene={fallback.scene} tone={fallback.tone} seed={fallback.seed} />
          )}
        </div>
        {(credit || isDemo) && (
          <p className="mono story-credit">{credit ?? "Ilustración de demostración"}</p>
        )}

        <div className="story-hero-text">
          <div className="mono flex flex-wrap items-center gap-x-3 text-white/70">{crumbs}</div>
          {kicker && <p className="mono text-accent">{kicker}</p>}
          <h1 id="story-title" className="display story-title">
            {lines.map((line, i) => (
              <span key={i}>
                <span className="story-line" style={i === lines.length - 1 && lines.length > 1 ? { color: "var(--accent)" } : undefined}>
                  {line}
                </span>{" "}
              </span>
            ))}
          </h1>
          {dek && <p className="max-w-[44ch] text-[0.95rem] leading-snug text-white/80">{dek}</p>}
          {meta && <div className="mono flex flex-wrap gap-x-5 gap-y-1 text-white/60">{meta}</div>}
        </div>
      </section>
    </div>
  );
}
