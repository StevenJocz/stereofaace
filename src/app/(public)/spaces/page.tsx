import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { listSpaces, type SpaceCard } from "@/modules/spaces/public";
import { spaceGenreOptions } from "@/modules/spaces/schema";
import { asc, eq } from "drizzle-orm";
import { Sk } from "@/ui/Skeleton";

export const metadata: Metadata = {
  title: "StereoFace Spaces · Tu espacio. Tu sonido. Tu identidad.",
  description: "Perfiles de la comunidad de StereoFace: música electrónica, indie y cultura alternativa. Crea tu Space y personalízalo.",
  alternates: { canonical: `${SITE_URL}/spaces` },
};

type Search = { q?: string; genero?: string; pagina?: string };

function Card({ s }: { s: SpaceCard }) {
  return (
    <li>
      <Link href={`/@${s.username}`} className="spaces-card">
        <span className="spaces-avatar">
          {s.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s
            <img src={s.avatarUrl} alt="" loading="lazy" />
          ) : (
            <span aria-hidden="true">{s.displayName.slice(0, 1).toUpperCase()}</span>
          )}
        </span>
        <span className="display-up text-[1.1rem] leading-none">
          @{s.username}
          {s.verifiedBadge && (
            <span className="ml-1 inline-block align-middle text-accent" title="Cuenta verificada">
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="10.5" fill="currentColor" />
                <path d="m7.5 12.3 3 3 6-6.3" fill="none" stroke="#07080a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">Cuenta verificada</span>
            </span>
          )}
        </span>
        <span className="muted truncate text-[0.88rem]">{s.displayName}</span>
        {s.tagline && <span className="mono muted line-clamp-2 text-[0.72rem]">{s.tagline}</span>}
        {s.genres.length > 0 && <span className="mono text-accent-ink text-[0.68rem]">{s.genres.join(" · ")}</span>}
      </Link>
    </li>
  );
}

async function Results({ sp }: { sp: Promise<Search> }) {
  await connection();
  const q = await sp;
  const db = await getDb();
  const page = Math.max(1, Number(q.pagina) || 1);
  const [res, genres, me] = await Promise.all([
    listSpaces(db, { q: q.q, genre: q.genero, page }),
    db.select({ slug: spaceGenreOptions.slug, name: spaceGenreOptions.name }).from(spaceGenreOptions).where(eq(spaceGenreOptions.active, true)).orderBy(asc(spaceGenreOptions.position)),
    getCurrentUser(),
  ]);
  const filtered = Boolean(q.q || q.genero);
  return (
    <>
      <form action="/spaces" className="mt-8 flex flex-wrap items-end gap-3" role="search">
        <label className="block">
          <span className="mono muted block">Buscar por usuario</span>
          <input className="input" name="q" defaultValue={q.q ?? ""} placeholder="@usuario" maxLength={30} />
        </label>
        {q.genero && <input type="hidden" name="genero" value={q.genero} />}
        <button type="submit" className="btn">
          Buscar
        </button>
        {filtered && (
          <Link href="/spaces" className="mono muted hover:text-accent-ink">
            Quitar filtros
          </Link>
        )}
      </form>

      <nav aria-label="Filtrar por género" className="mt-4 flex flex-wrap gap-2">
        {genres.map((g) => (
          <Link key={g.slug} href={`/spaces?genero=${g.slug}${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}`} className={`chip-day !w-auto px-3 ${q.genero === g.slug ? "is-on" : ""}`} aria-current={q.genero === g.slug ? "true" : undefined}>
            {g.name}
          </Link>
        ))}
      </nav>

      {res.featured.length > 0 && (
        <section className="mt-12" aria-label="Destacados">
          <h2 className="display-up text-[1.4rem]">Destacados</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{res.featured.map((s) => <Card key={s.username} s={s} />)}</ul>
        </section>
      )}
      <section className="mt-12" aria-label="Perfiles">
        <h2 className="display-up text-[1.4rem]">{filtered ? `Resultados (${res.total})` : "Recientes"}</h2>
        {res.recent.length === 0 && res.featured.length === 0 ? (
          <div className="panel mt-4 p-6">
            <p className="font-bold">{filtered ? "Nadie coincide con esa búsqueda." : "Todavía no hay Spaces publicados."}</p>
            <p className="muted mt-1">{filtered ? "Prueba con otro nombre o género." : "Sé la primera persona en crear el tuyo."}</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{res.recent.map((s) => <Card key={s.username} s={s} />)}</ul>
        )}
        {res.total > page * 24 && (
          <Link href={`/spaces?pagina=${page + 1}${q.q ? `&q=${encodeURIComponent(q.q)}` : ""}${q.genero ? `&genero=${q.genero}` : ""}`} className="btn mt-6">
            Ver más
          </Link>
        )}
      </section>
      <div className="mt-12 flex flex-wrap gap-3">
        {me ? (
          <Link href="/spaces/editar" className="btn btn-accent">
            Editar mi Space
          </Link>
        ) : (
          <>
            <Link href="/spaces/registro" className="btn btn-accent">
              Crear mi Space
            </Link>
            <Link href="/spaces/entrar" className="btn">
              Entrar
            </Link>
          </>
        )}
      </div>
    </>
  );
}

export default function SpacesPage({ searchParams }: { searchParams: Promise<Search> }) {
  return (
    <div className="wrap pb-16">
      <section className="spaces-hero">
        <p className="mono text-accent-ink">StereoFace Spaces</p>
        <h1 className="display-up mt-2 text-[clamp(2.6rem,9vw,7rem)] leading-[0.88]">
          Tu espacio.
          <br />
          Tu sonido.
          <br />
          <span className="text-accent-ink">Tu identidad.</span>
        </h1>
        <p className="muted mt-5 max-w-[56ch]">Crea tu perfil, personalízalo como quieras y muestra la música que eres. La comunidad de StereoFace: techno, house, indie y cultura alternativa.</p>
      </section>
      <Suspense fallback={<div className="mt-8"><Sk className="h-10 w-72" /><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Sk key={i} className="h-40 w-full" />)}</div></div>}>
        <Results sp={searchParams} />
      </Suspense>
    </div>
  );
}
