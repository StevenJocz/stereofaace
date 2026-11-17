import { Suspense } from "react";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { getPublicProgram } from "@/modules/schedule/public";
import { PosterImage } from "@/ui/radio/ProgramPoster";
import { groupWeekly, whenLabel } from "@/ui/radio/program-format";
import { formatRange } from "@/ui/radio/schedule-view";
import { Sk } from "@/ui/Skeleton";

type Params = { slug: string };
const validSlug = (s: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const p = validSlug(slug) ? await getPublicProgram(await getDb(), slug) : null;
  if (!p) return { title: "No encontrado · StereoFace" };
  const description = p.description ?? `${p.name}, un programa de StereoFace Radio${p.hosts ? ` con ${p.hosts}` : ""}.`;
  return {
    title: `${p.name} · Programas · StereoFace Radio`,
    description,
    alternates: { canonical: `${SITE_URL}/programas/${p.slug}` },
    openGraph: { title: p.name, description, url: `${SITE_URL}/programas/${p.slug}`, siteName: "StereoFace", images: p.imageUrl ? [`${SITE_URL}${p.imageUrl}`] : undefined },
  };
}

async function ProgramView({ params }: { params: Promise<Params> }) {
  await connection();
  const { slug } = await params;
  if (!validSlug(slug)) notFound();
  const now = new Date();
  const p = await getPublicProgram(await getDb(), slug, now);
  if (!p) notFound();
  const groups = groupWeekly(p.weekly);

  return (
    <article className="prog-page wrap pt-8 pb-20" style={{ ["--pc" as string]: p.color } as CSSProperties}>
      <nav aria-label="Migas de pan" className="mono text-muted">
        <Link href="/" className="hover:text-accent-ink">
          Inicio
        </Link>{" "}
        /{" "}
        <Link href="/programas" className="hover:text-accent-ink">
          Programas
        </Link>
      </nav>

      <div className="prog-hero mt-8">
        <div className="prog-poster stereo-host">
          <PosterImage p={p} ratio="4 / 5" priority />
          <span className="prog-stamp mono" data-live={p.onAir}>
            {p.onAir && <span className="prog-dot" aria-hidden="true" />}
            {p.onAir ? "En el aire" : "StereoFace Radio"}
          </span>
        </div>

        <div className="prog-copy">
          <p className="mono text-accent-ink">Programa · StereoFace Radio</p>
          <h1 className="prog-title display-up">
            <span>{p.name}</span>
          </h1>
          {p.hosts && (
            <p className="prog-host">
              <span className="mono muted">Con</span> <b>{p.hosts}</b>
            </p>
          )}
          {p.description && <p className="prog-lead">{p.description}</p>}

          {groups.length > 0 && (
            <section aria-label="Horario semanal" className="mt-8">
              <h2 className="mono muted">Horario · hora de Colombia</h2>
              <ul className="prog-sched">
                {groups.map((g) => (
                  <li key={`${g.start}-${g.end}`}>
                    <span className="mono">{g.days.join(" · ")}</span>
                    <b>
                      {g.start}–{g.end}
                    </b>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.upcoming.length > 0 && (
            <section aria-label="Próximas emisiones" className="mt-6">
              <h2 className="mono muted">Próximas emisiones</h2>
              <ul className="prog-next">
                {p.upcoming.map((u) => (
                  <li key={u.startsAt}>
                    <span>{whenLabel(u.startsAt, now)}</span>
                    <span className="mono muted">{formatRange(u.startsAt, u.endsAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mono muted mt-8">El audio es el de la radio: dale play en la barra inferior.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/programas" className="btn">
              ← Todos los programas
            </Link>
            <Link href="/cabina" className="btn">
              Cabina en vivo
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ProgramPage(props: { params: Promise<Params> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <div className="prog-hero">
            <Sk className="w-full" style={{ aspectRatio: "4 / 5", borderRadius: 10 }} />
            <div>
              <Sk className="h-3 w-40" />
              <Sk className="mt-4 h-16 w-3/4" />
              <Sk className="mt-6 h-4 w-full" />
              <Sk className="mt-2 h-4 w-2/3" />
            </div>
          </div>
        </div>
      }
    >
      <ProgramView params={props.params} />
    </Suspense>
  );
}
