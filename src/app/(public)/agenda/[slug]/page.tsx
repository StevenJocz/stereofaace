import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { EVENT_KIND_LABEL } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { formatAgendaDate } from "@/lib/time";
import { getEventPage } from "@/modules/events/service";
import { EventCardView } from "@/ui/EventCardView";
import { ShareButtons } from "@/ui/ShareButtons";
import { StoryHero } from "@/ui/StoryHero";

type Params = { slug: string };
const validSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const countryName = (code: string) => {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};
const FULL = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" });
const HOUR = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Bogota" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** JSON-LD seguro: se escapa «<» para que el contenido no pueda cerrar la etiqueta script. */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");
const gcalDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) return { title: "No encontrado · StereoFace" };
  const e = await getEventPage(await getDb(), slug);
  if (!e) return { title: "No encontrado · StereoFace" };
  const description = e.description ? e.description.slice(0, 160) : `${e.name} · ${e.city}, ${countryName(e.country)} · ${formatAgendaDate(e.startsAt)}. Información, cartel y entradas oficiales.`;
  return {
    title: `${e.name} · Agenda · StereoFace`,
    description,
    alternates: { canonical: `${SITE_URL}/agenda/${e.slug}` },
    openGraph: { type: "website", title: e.name, description, url: `${SITE_URL}/agenda/${e.slug}`, siteName: "StereoFace", images: e.imageUrl ? [`${SITE_URL}${e.imageUrl}`] : undefined },
  };
}

async function EventView({ params }: { params: Promise<Params> }) {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const e = await getEventPage(await getDb(), slug);
  if (!e) notFound();
  const country = countryName(e.country);
  const art = e.coverArt ?? { scene: "crowd" as const, tone: "acid" as const, seed: 11 };
  const url = `${SITE_URL}/agenda/${e.slug}`;
  const paragraphs = (e.description ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const end = e.endsAt ?? new Date(e.startsAt.getTime() + 3 * 3600_000);
  const place = [e.venue, e.city, country].filter(Boolean).join(", ");
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.name)}&dates=${gcalDate(e.startsAt)}/${gcalDate(end)}&location=${encodeURIComponent(place)}&details=${encodeURIComponent(url)}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.name,
    startDate: e.startsAt.toISOString(),
    endDate: e.endsAt?.toISOString(),
    eventStatus: e.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: { "@type": "Place", name: e.venue ?? e.city, address: { "@type": "PostalAddress", addressLocality: e.city, addressCountry: e.country } },
    description: e.description ?? undefined,
    image: e.imageUrl ? [`${SITE_URL}${e.imageUrl}`] : undefined,
    performer: e.lineup.length ? e.lineup.map((l) => ({ "@type": "MusicGroup", name: l.name })) : undefined,
    offers: e.ticketUrl ? { "@type": "Offer", url: e.ticketUrl } : undefined,
    url,
  };

  const facts: [string, React.ReactNode][] = [
    ["Fecha", cap(FULL.format(e.startsAt))],
    ["Hora", `${HOUR.format(e.startsAt)}${e.endsAt ? ` – ${HOUR.format(e.endsAt)}` : ""} (hora de Bogotá)`],
    ["Lugar", e.venue ?? "Por confirmar"],
    ["Ciudad", `${e.city}, ${country}`],
    ["Tipo", EVENT_KIND_LABEL[e.kind]],
    ...(e.genre ? ([["Género", e.genre]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(jsonLd) }} />
      <StoryHero
        crumbs={
          <>
            <Link href="/" className="hover:text-accent">
              Inicio
            </Link>
            <span className="opacity-50">/</span>
            <Link href="/agenda" className="hover:text-accent">
              Agenda
            </Link>
          </>
        }
        kicker={[EVENT_KIND_LABEL[e.kind], e.genre, e.cancelled ? "Cancelado" : e.past ? "Ya pasó" : null].filter(Boolean).join(" · ")}
        title={e.name}
        dek={`${formatAgendaDate(e.startsAt)} · ${e.city}, ${country}`}
        image={e.imageUrl ? { src: e.imageUrl, alt: e.imageCredit?.alt ?? e.name, credit: e.imageCredit?.credit ? `Imagen: ${e.imageCredit.credit}` : null } : null}
        art={art}
        isDemo={e.isDemo}
      />

      <div className="wrap mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          {e.cancelled && (
            <p role="status" className="panel mb-6 p-4 text-[#ff8a8a]">
              Este evento fue cancelado. Consulta al organizador para reembolsos o cambios.
            </p>
          )}
          <h2 className="display t-m">Sobre el evento</h2>
          {paragraphs.length ? (
            paragraphs.map((p, i) => (
              <p key={i} className="mt-4 max-w-[62ch] whitespace-pre-line text-[1.1rem] leading-relaxed">
                {p}
              </p>
            ))
          ) : (
            <p className="mt-4 text-muted">El organizador aún no publicó más detalles. Revisa el enlace oficial.</p>
          )}

          {e.lineup.length > 0 && (
            <section aria-labelledby="cartel" className="mt-14">
              <h2 id="cartel" className="display t-m">
                Cartel
              </h2>
              <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {e.lineup.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/artistas/${a.slug}`} className="panel flex items-center gap-3 p-3 transition-colors hover:border-accent">
                      <span className="size-12 shrink-0 overflow-hidden rounded-full border border-line bg-panel">
                        {a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por /media
                          <img src={a.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                        ) : (
                          <span className="grid size-full place-items-center font-bold" aria-hidden="true">
                            {a.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="font-bold leading-tight">{a.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {e.gallery.length > 0 && (
            <section aria-labelledby="galeria" className="mt-14">
              <h2 id="galeria" className="display t-m">
                Galería
              </h2>
              <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {e.gallery.map((g, i) => (
                  <li key={g.url} className="overflow-hidden rounded-[10px] border border-line">
                    <a href={g.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver imagen ${i + 1} en grande`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /media */}
                      <img src={g.url} alt={g.alt ?? `${e.name}, imagen ${i + 1}`} className="aspect-[4/3] size-full object-cover transition-transform duration-500 hover:scale-105" loading="lazy" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-label="Datos del evento" className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-5">
            <dl className="grid gap-3">
              {facts.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                  <dt className="mono text-muted">{k}</dt>
                  <dd className="font-bold">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid gap-2">
              {e.ticketUrl && !e.cancelled && !e.past ? (
                <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-accent justify-center">
                  Entradas oficiales ↗
                </a>
              ) : e.ticketUrl ? (
                <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn justify-center">
                  Sitio del organizador ↗
                </a>
              ) : null}
              <a href={maps} target="_blank" rel="noopener noreferrer" className="btn justify-center">
                Cómo llegar ↗
              </a>
              {!e.past && !e.cancelled && (
                <a href={gcal} target="_blank" rel="noopener noreferrer" className="btn justify-center">
                  Añadir al calendario ↗
                </a>
              )}
            </div>
            <p className="mono muted mt-4 text-[0.66rem]">StereoFace no vende entradas: el enlace es del organizador.</p>
          </div>
          <div className="mt-5">
            <ShareButtons url={url} title={e.name} />
          </div>
        </aside>
      </div>

      {e.related.length > 0 && (
        <section aria-labelledby="mas" className="wrap mt-20">
          <h2 id="mas" className="display t-m">
            Más en la agenda
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {e.related.map((r) => (
              <li key={r.id}>
                <EventCardView e={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-24" />
    </article>
  );
}

export default function EventPage(props: { params: Promise<Params> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <div className="h-[60vh]" />
        </div>
      }
    >
      <EventView params={props.params} />
    </Suspense>
  );
}
