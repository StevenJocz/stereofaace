import Link from "next/link";
import { EVENT_KIND_LABEL } from "@/lib/labels";
import { formatAgendaDate } from "@/lib/time";
import type { EventCard } from "@/modules/events/service";
import { Art } from "./Art";

/** Imagen grande del evento destacado de la agenda (el próximo) con acceso directo a su ficha completa. */
export function FeaturedEvent({ e }: { e: EventCard }) {
  const art = e.coverArt ?? { scene: "crowd" as const, tone: "acid" as const, seed: 11 };
  return (
    <Link href={`/agenda/${e.slug}`} className="feat-event group" aria-label={`${e.name}: ver más información del evento`}>
      <span className="feat-event-img">
        {e.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /media
          <img src={e.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <Art scene={art.scene} tone={art.tone} seed={art.seed} />
        )}
      </span>
      <span className="feat-event-shade" aria-hidden="true" />
      <span className="mono feat-event-badge">Próximo evento{e.isDemo ? " · demo" : ""}</span>
      <span className="feat-event-text">
        <span className="display-cond feat-event-date">{formatAgendaDate(e.startsAt)}</span>
        <span className="display-up feat-event-name">{e.name}</span>
        <span className="mono feat-event-meta">
          {e.city}, {e.country} · {EVENT_KIND_LABEL[e.kind]}
        </span>
        <span className="mono feat-event-go">Ver más información →</span>
      </span>
    </Link>
  );
}
