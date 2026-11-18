import Link from "next/link";
import { EVENT_KIND_LABEL } from "@/lib/labels";
import { formatAgendaDate } from "@/lib/time";
import type { EventCard } from "@/modules/events/service";
import { Art } from "./Art";
import { StereoImage } from "./StereoImage";

/** Tarjeta de un evento con su imagen (o ilustración) que lleva a la ficha completa. */
export function EventCardView({ e }: { e: EventCard }) {
  const art = e.coverArt ?? { scene: "crowd" as const, tone: "acid" as const, seed: 11 };
  return (
    <article className="stereo-host hover-host">
      <div className="relative">
        <StereoImage ratio="4 / 3">
          {e.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /media
            <img src={e.imageUrl} alt={e.name} className="size-full object-cover" loading="lazy" />
          ) : (
            <Art scene={art.scene} tone={art.tone} seed={art.seed} />
          )}
        </StereoImage>
        <span className="tag tag-fill absolute left-2 top-2 z-10">{formatAgendaDate(e.startsAt)}</span>
        {e.isDemo && <span className="tag tag-demo absolute right-2 top-2 z-10">Demo</span>}
      </div>
      <h3 className="display-up mt-3 text-[1.25rem]">
        <Link href={`/agenda/${e.slug}`} className="stretch">
          <span className="sweep">{e.name}</span>
        </Link>
      </h3>
      <p className="mono muted">
        {e.city}, {e.country} · {EVENT_KIND_LABEL[e.kind]}
      </p>
    </article>
  );
}
