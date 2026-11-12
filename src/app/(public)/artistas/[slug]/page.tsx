import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { EVENT_KIND_LABEL, RELEASE_KIND_LABEL } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { formatAgendaDate, formatShortDate } from "@/lib/time";
import { getArtistProfile } from "@/modules/artists/profile";
import { ArticleCover } from "@/ui/ArticleCover";
import { StoryHero } from "@/ui/StoryHero";

type Params = { slug: string };
const validSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;

const LINK_LABEL: Record<string, string> = {
  spotify: "Spotify",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
  youtube: "YouTube",
  instagram: "Instagram",
  web: "Sitio web",
};

const regionNames = new Intl.DisplayNames(["es"], { type: "region" });
const countryName = (code: string | null) => {
  if (!code) return null;
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
};

/** JSON-LD seguro: se escapa «<» para que el contenido no pueda cerrar la etiqueta script. */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) return { title: "No encontrado · StereoFace" };
  const p = await getArtistProfile(await getDb(), slug);
  if (!p) return { title: "No encontrado · StereoFace" };
  const description = p.bio ? p.bio.slice(0, 160) : `Perfil de ${p.name} en StereoFace: noticias, lanzamientos y fechas.`;
  return {
    title: `${p.name} · StereoFace`,
    description,
    alternates: { canonical: `${SITE_URL}/artistas/${p.slug}` },
    openGraph: {
      type: "profile",
      title: p.name,
      description,
      url: `${SITE_URL}/artistas/${p.slug}`,
      siteName: "StereoFace",
      images: p.imageUrl ? [`${SITE_URL}${p.imageUrl}`] : undefined,
    },
  };
}

async function ProfileView({ params }: { params: Promise<Params> }) {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const p = await getArtistProfile(await getDb(), slug);
  if (!p) notFound();
  const country = countryName(p.country);
  const links = Object.entries(p.links).filter(([, url]) => !!url) as [string, string][];
  const art = p.coverArt ?? { scene: "wave" as const, tone: "acid" as const, seed: 7 };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: p.name,
    url: `${SITE_URL}/artistas/${p.slug}`,
    description: p.bio ?? undefined,
    image: p.imageUrl ? `${SITE_URL}${p.imageUrl}` : undefined,
    genre: p.genres.length ? p.genres : undefined,
    sameAs: links.length ? links.map(([, url]) => url) : undefined,
  };

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
            <Link href="/artistas" className="hover:text-accent">
              Artistas y bandas
            </Link>
          </>
        }
        kicker={[country, ...p.genres].filter(Boolean).join(" · ") || null}
        title={p.name}
        dek={null}
        image={
          p.imageUrl
            ? {
                src: p.imageUrl,
                alt: p.photoCredit?.alt ?? p.name,
                credit: p.photoCredit?.credit
                  ? `Foto: ${p.photoCredit.credit}${p.photoCredit.license ? ` · ${p.photoCredit.license.split(" — ")[0]}` : ""}`
                  : null,
              }
            : null
        }
        art={art}
        isDemo={p.isDemo}
      />

      {(p.bio || links.length > 0) && (
        <section aria-labelledby="sobre" className="wrap mt-12">
          <h2 id="sobre" className="display t-m">
            Sobre {p.name}
          </h2>
          {p.bio && <p className="mt-4 max-w-[62ch] text-[1.1rem] leading-relaxed">{p.bio}</p>}
          {links.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Enlaces oficiales">
              {links.map(([key, url]) => (
                <li key={key}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="btn !px-4 !py-2">
                    {LINK_LABEL[key] ?? key} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {p.events.length > 0 && (
        <section aria-labelledby="fechas" className="wrap mt-20">
          <h2 id="fechas" className="display t-m">
            Próximas fechas
          </h2>
          <ul className="mt-6">
            {p.events.map((e) => (
              <li key={e.id} className="spec-row">
                <span className="display-cond text-[1.8rem] text-accent-ink">{formatAgendaDate(e.startsAt)}</span>
                <span>
                  <span className="display-up block text-[1.2rem]">{e.name}</span>
                  <span className="mono muted">
                    {e.city}, {e.country}
                    {e.venue ? ` · ${e.venue}` : ""} · {EVENT_KIND_LABEL[e.kind]}
                  </span>
                </span>
                {e.ticketUrl ? (
                  <a href={e.ticketUrl} target="_blank" rel="noopener noreferrer" className="mono hover:text-accent-ink">
                    Entradas ↗
                  </a>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.releases.length > 0 && (
        <section aria-labelledby="discos" className="wrap mt-20">
          <h2 id="discos" className="display t-m">
            Lanzamientos
          </h2>
          <ul className="mt-6">
            {p.releases.map((r) => (
              <li key={r.id} className="spec-row !grid-cols-[5rem_1fr_auto]">
                <span className="tag w-fit">{RELEASE_KIND_LABEL[r.kind]}</span>
                <span>
                  <span className="display-up block text-[1.2rem]">{r.title}</span>
                  {r.label && <span className="mono muted">{r.label}</span>}
                </span>
                <span className="mono">{formatShortDate(r.releasedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="noticias" className="wrap mt-20">
        <h2 id="noticias" className="display t-m">
          Noticias
        </h2>
        {p.news.length === 0 ? (
          <p className="mt-6 text-muted">Todavía no hay noticias etiquetadas con {p.name}.</p>
        ) : (
          <ul className="grid12 mt-6 gap-y-10">
            {p.news.map((n) => (
              <li key={n.id} className="hover-host col-span-12 sm:col-span-6 lg:col-span-4">
                <article>
                  <ArticleCover s={n} ratio="4 / 3" />
                  <p className="mono muted mt-3 flex flex-wrap gap-x-3">
                    <span className="text-fg">{n.kicker ?? n.categoryName}</span>
                    <span>{formatShortDate(n.publishedAt)}</span>
                    {n.readMinutes && <span>{n.readMinutes} min</span>}
                  </p>
                  <h3 className="mt-2 text-[1.35rem] font-bold leading-[1.1]">
                    <Link href={`/noticias/${n.slug}`} className="stretch">
                      <span className="sweep">{n.title}</span>
                    </Link>
                  </h3>
                  {n.dek && <p className="mt-2 text-muted">{n.dek}</p>}
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}

export default function ArtistProfilePage(props: { params: Promise<Params> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <div className="h-[60vh]" />
        </div>
      }
    >
      <ProfileView params={props.params} />
    </Suspense>
  );
}
