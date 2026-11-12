import { Art } from "@/ui/Art";
import type { StoryCard } from "@/modules/content/service";

/** Portada: la fotografía por URL tiene prioridad; si no hay, la ilustración generativa (siempre marcada demo si lo es). */
export function ArticleCover({
  s,
  ratio = "16 / 9",
  priority = false,
  className = "",
}: {
  s: Pick<StoryCard, "coverUrl" | "coverAlt" | "coverArt" | "isDemo" | "title">;
  ratio?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--r)] border border-line bg-black ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {s.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagen remota por URL: no se optimiza hasta que exista el módulo de medios
        <img
          src={s.coverUrl}
          alt={s.coverAlt ?? ""}
          className="absolute inset-0 size-full object-cover"
          referrerPolicy="no-referrer"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
        />
      ) : s.coverArt ? (
        <div className="absolute inset-0">
          <Art scene={s.coverArt.scene} tone={s.coverArt.tone} seed={s.coverArt.seed} />
        </div>
      ) : (
        <div className="absolute inset-0 bg-panel-2" />
      )}
      {s.isDemo && <span className="tag tag-demo absolute left-3 top-3">Demo</span>}
    </div>
  );
}
