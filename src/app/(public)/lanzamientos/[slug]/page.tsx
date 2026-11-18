import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { RELEASE_KIND_LABEL } from "@/lib/labels";
import { SITE_URL } from "@/lib/site";
import { formatShortDate } from "@/lib/time";
import { releaseEmbed } from "@/modules/releases/embed";
import { getReleasePage } from "@/modules/releases/service";
import { Art } from "@/ui/Art";
import { ReleasePlayer } from "@/ui/ReleasePlayer";
import { ShareButtons } from "@/ui/ShareButtons";

type Params = { slug: string };
const validSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;
/** JSON-LD seguro: se escapa «<» para que el contenido no pueda cerrar la etiqueta script. */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) return { title: "No encontrado · StereoFace" };
  const r = await getReleasePage(await getDb(), slug);
  if (!r) return { title: "No encontrado · StereoFace" };
  const who = r.artists.map((a) => a.name).join(", ");
  const description = r.description ? r.description.slice(0, 160) : `${r.title}${who ? ` de ${who}` : ""}: ${RELEASE_KIND_LABEL[r.kind].toLowerCase()} publicado el ${formatShortDate(r.releasedAt)}. Escúchalo aquí.`;
  return {
    title: `${r.title}${who ? ` — ${who}` : ""} · StereoFace`,
    description,
    alternates: { canonical: `${SITE_URL}/lanzamientos/${r.slug}` },
    openGraph: { type: "music.album", title: r.title, description, url: `${SITE_URL}/lanzamientos/${r.slug}`, siteName: "StereoFace", images: r.coverUrl ? [`${SITE_URL}${r.coverUrl}`] : undefined },
  };
}

async function ReleaseView({ params }: { params: Promise<Params> }) {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const r = await getReleasePage(await getDb(), slug);
  if (!r) notFound();
  const art = r.coverArt ?? { scene: "vinyl" as const, tone: "acid" as const, seed: 5 };
  const url = `${SITE_URL}/lanzamientos/${r.slug}`;
  const embed = releaseEmbed(r.embedUrl, r.title);
  const who = r.artists.map((a) => a.name).join(", ");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": r.kind === "single" ? "MusicRecording" : "MusicAlbum",
    name: r.title,
    url,
    datePublished: r.releasedAt.toISOString().slice(0, 10),
    byArtist: r.artists.map((a) => ({ "@type": "MusicGroup", name: a.name })),
    image: r.coverUrl ? `${SITE_URL}${r.coverUrl}` : undefined,
    description: r.description ?? undefined,
    recordLabel: r.label ? { "@type": "Organization", name: r.label } : undefined,
  };

  return (
    <article className="wrap pt-8 pb-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(jsonLd) }} />
      <nav aria-label="Migas de pan" className="mono text-muted">
        <Link href="/" className="hover:text-accent-ink">
          Inicio
        </Link>{" "}
        /{" "}
        <Link href="/#lanzamientos" className="hover:text-accent-ink">
          Lanzamientos
        </Link>
      </nav>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="relative">
          <div className="aspect-square overflow-hidden rounded-[12px] border border-line bg-panel">
            {r.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- portada propia servida por /media
              <img src={r.coverUrl} alt={r.coverCredit?.alt ?? `Portada de ${r.title}`} className="size-full object-cover" fetchPriority="high" />
            ) : (
              <Art scene={art.scene} tone={art.tone} seed={art.seed} />
            )}
          </div>
          {(r.coverCredit?.credit || r.isDemo) && <p className="mono muted mt-2 text-[0.66rem]">{r.coverCredit?.credit ? `Portada: ${r.coverCredit.credit}` : "Ilustración de demostración"}</p>}
        </div>

        <div>
          <p className="mono flex flex-wrap items-center gap-x-3 text-accent-ink">
            <span className="tag w-fit">{RELEASE_KIND_LABEL[r.kind]}</span>
            <span>{formatShortDate(r.releasedAt)}</span>
            {r.label && <span className="text-muted">{r.label}</span>}
            {r.isDemo && <span className="tag tag-demo">Demo</span>}
          </p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5.5vw,4.6rem)] leading-[0.95]">{r.title}</h1>
          {r.artists.length > 0 && (
            <p className="mt-3 text-[1.25rem] font-bold">
              {r.artists.map((a, i) => (
                <span key={a.slug}>
                  {i > 0 && ", "}
                  <Link href={`/artistas/${a.slug}`} className="hover:text-accent-ink">
                    {a.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {r.description && <p className="mt-5 max-w-[56ch] whitespace-pre-line text-[1.08rem] leading-relaxed">{r.description}</p>}

          <div className="mt-8">
            {embed ? (
              <>
                <h2 className="mono mb-3 text-muted">Escúchalo</h2>
                <ReleasePlayer embed={embed} />
              </>
            ) : (
              <p className="text-muted">Todavía no hay reproductor oficial para este lanzamiento.</p>
            )}
          </div>

          <div className="mt-8">
            <ShareButtons url={url} title={`${r.title}${who ? ` — ${who}` : ""}`} />
          </div>
        </div>
      </div>

      {r.more.length > 0 && (
        <section aria-labelledby="mas" className="mt-20">
          <h2 id="mas" className="display t-m">
            Más de {r.artists.length === 1 ? r.artists[0].name : "estos artistas"}
          </h2>
          <ul className="mt-6">
            {r.more.map((m) => (
              <li key={m.slug} className="spec-row hover-host relative !grid-cols-[5rem_1fr_auto]">
                <span className="tag w-fit">{RELEASE_KIND_LABEL[m.kind]}</span>
                <span>
                  <Link href={`/lanzamientos/${m.slug}`} className="stretch">
                    <span className="display-up block text-[1.2rem]">{m.title}</span>
                  </Link>
                  <span className="mono muted">{m.artistNames.join(", ")}</span>
                </span>
                <span className="mono">{formatShortDate(m.releasedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export default function ReleasePage(props: { params: Promise<Params> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <div className="h-[60vh]" />
        </div>
      }
    >
      <ReleaseView params={props.params} />
    </Suspense>
  );
}
