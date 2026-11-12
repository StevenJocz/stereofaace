import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { getPublishedPage } from "@/modules/content/pages-admin";

type Params = { slug: string };
const validSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) return { title: "No encontrado · StereoFace" };
  const page = await getPublishedPage(await getDb(), slug);
  if (!page) return { title: "No encontrado · StereoFace" };
  const title = page.seo.title || page.title;
  return {
    title: `${title} · StereoFace`,
    description: page.seo.description || undefined,
    alternates: { canonical: `${SITE_URL}/pagina/${slug}` },
  };
}

async function PageView({ params }: { params: Promise<Params> }) {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const page = await getPublishedPage(await getDb(), slug);
  if (!page) notFound();
  return (
    <article>
      <header className="wrap pt-8">
        <nav aria-label="Migas de pan" className="mono text-muted">
          <Link href="/" className="hover:text-accent-ink">
            Inicio
          </Link>
        </nav>
        <h1 className="display mt-6 max-w-5xl text-[clamp(2.2rem,5.6vw,5.4rem)]">{page.title}</h1>
      </header>
      <div className="wrap mt-10">
        {/* El HTML se sanea en el servidor al guardar (misma lista blanca que los artículos). */}
        <div className="article-body" dangerouslySetInnerHTML={{ __html: page.bodyHtml ?? "" }} />
      </div>
    </article>
  );
}

export default function FixedPage(props: { params: Promise<Params> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <div className="h-[40vh]" />
        </div>
      }
    >
      <PageView params={props.params} />
    </Suspense>
  );
}
