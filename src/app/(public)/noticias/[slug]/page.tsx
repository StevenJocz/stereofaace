import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { formatShortDate } from "@/lib/time";
import { getArticleArtists } from "@/modules/artists/profile";
import { getArticleBySlug, getRelatedArticles } from "@/modules/content/service";
import { ArticleCover } from "@/ui/ArticleCover";
import { StoryHero } from "@/ui/StoryHero";
import { ShareButtons } from "@/ui/ShareButtons";

type Params = { slug: string };
const validSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) return { title: "No encontrado · StereoFace" };
  const a = await getArticleBySlug(await getDb(), slug);
  if (!a) return { title: "No encontrado · StereoFace" };
  const title = a.seo.title || a.title;
  const description = a.seo.description || a.dek || undefined;
  const url = `${SITE_URL}/noticias/${a.slug}`;
  return {
    title: `${title} · StereoFace`,
    description,
    alternates: { canonical: a.seo.canonical ?? url },
    robots: a.seo.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      url,
      siteName: "StereoFace",
      publishedTime: a.publishedAt.toISOString(),
      modifiedTime: a.updatedAt.toISOString(),
      images: a.seo.ogImage ? [a.seo.ogImage] : a.coverUrl ? [a.coverUrl] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** JSON-LD seguro: se escapa «<» para que el contenido no pueda cerrar la etiqueta script. */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, "\\u003c");

async function ArticleView({ params }: { params: Promise<Params> }) {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const db = await getDb();
  const a = await getArticleBySlug(db, slug);
  if (!a) notFound();
  const [related, artistsTagged] = await Promise.all([getRelatedArticles(db, a, 3), getArticleArtists(db, a.id)]);
  const url = `${SITE_URL}/noticias/${a.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: a.title,
    description: a.dek ?? undefined,
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    author: { "@type": "Person", name: a.authorName ?? "Redacción StereoFace" },
    publisher: { "@type": "Organization", name: "StereoFace" },
    mainEntityOfPage: url,
    image: a.coverUrl ? [a.coverUrl] : undefined,
    articleSection: a.categoryName ?? undefined,
    keywords: a.tags.length ? a.tags.join(", ") : undefined,
    inLanguage: "es",
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Inicio", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Noticias", item: `${SITE_URL}/noticias` },
      { "@type": "ListItem", position: 3, name: a.title, item: url },
    ],
  };

  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld(crumbs) }} />

      <StoryHero
        crumbs={
          <>
            <Link href="/" className="hover:text-accent">
              Inicio
            </Link>
            <span className="opacity-50">/</span>
            <Link href="/noticias" className="hover:text-accent">
              Noticias
            </Link>
            {a.categorySlug && (
              <>
                <span className="opacity-50">/</span>
                <Link href={`/noticias?categoria=${a.categorySlug}`} className="hover:text-accent">
                  {a.categoryName}
                </Link>
              </>
            )}
          </>
        }
        kicker={a.kicker}
        title={a.title}
        dek={a.dek}
        image={a.coverUrl ? { src: a.coverUrl, alt: a.coverAlt ?? "", credit: a.coverCredit } : null}
        art={a.coverArt}
        isDemo={a.isDemo && !a.coverUrl}
        meta={
          <>
            <span className="text-white">{a.authorName ?? "Redacción StereoFace"}</span>
            <time dateTime={a.publishedAt.toISOString()}>{formatShortDate(a.publishedAt)}</time>
            {a.readMinutes && <span>{a.readMinutes} min de lectura</span>}
          </>
        }
      />

      <div className="wrap mt-12 grid gap-10 xl:grid-cols-[12rem_minmax(0,1fr)_12rem]">
        <aside className="hidden xl:block" aria-hidden="true" />
        <div className="mx-auto w-full min-w-0 max-w-[44rem] xl:mx-0">
          {a.bodyHtml ? (
            <div className="article-body" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />
          ) : (
            <p className="text-muted">Este artículo aún no tiene contenido.</p>
          )}

          {artistsTagged.length > 0 && (
            <section aria-labelledby="artistas-nota" className="mt-10">
              <h2 id="artistas-nota" className="mono text-muted">
                Artistas y bandas en esta nota
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {artistsTagged.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/artistas/${t.slug}`} className="btn !px-4 !py-2">
                      {t.name} →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-2" aria-label="Etiquetas">
              {a.tags.map((t) => (
                <li key={t} className="tag">
                  {t}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10 border-t border-line pt-6">
            <ShareButtons url={url} title={a.title} />
          </div>

          {a.references.length > 0 && (
            <section aria-labelledby="fuentes" className="mt-10 border-t border-line pt-6">
              <h2 id="fuentes" className="mono text-accent-ink">
                Fuentes y referencias
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5">
                {a.references.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="underline underline-offset-4 hover:text-accent-ink"
                    >
                      {r.title}
                    </a>
                    {r.outlet && <span className="mono text-muted"> · {r.outlet}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        <aside className="hidden xl:block" aria-hidden="true" />
      </div>

      {related.length > 0 && (
        <section aria-labelledby="relacionadas" className="wrap mt-20 border-t border-line pt-8">
          <h2 id="relacionadas" className="display t-m">
            Sigue leyendo
          </h2>
          <ul className="grid12 mt-6 gap-y-8">
            {related.map((r) => (
              <li key={r.id} className="hover-host col-span-12 sm:col-span-6 lg:col-span-4">
                <ArticleCover s={r} ratio="4 / 3" />
                <p className="mono muted mt-3">
                  {r.kicker ?? r.categoryName} · {formatShortDate(r.publishedAt)}
                </p>
                <h3 className="mt-1 text-[1.25rem] font-bold leading-[1.15]">
                  <Link href={`/noticias/${r.slug}`} className="stretch">
                    <span className="sweep">{r.title}</span>
                  </Link>
                </h3>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

export default function ArticlePage(props: { params: Promise<Params> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <div className="h-[60vh]" />
        </div>
      }
    >
      <ArticleView params={props.params} />
    </Suspense>
  );
}
