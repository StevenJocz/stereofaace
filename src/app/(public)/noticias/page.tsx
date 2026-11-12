import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { formatShortDate } from "@/lib/time";
import { listPublishedArticles } from "@/modules/content/service";
import { listCategories } from "@/modules/taxonomy/service";
import { ArticleCover } from "@/ui/ArticleCover";

export const metadata: Metadata = {
  title: "Noticias · StereoFace",
  description: "Noticias de música electrónica, indie y cultura underground.",
  alternates: { canonical: "/noticias" },
};

type SP = { categoria?: string; q?: string; pagina?: string };

async function Listing({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const db = await getDb();
  const page = Math.max(1, Number(sp.pagina) || 1);
  const q = sp.q && sp.q.trim().length >= 2 ? sp.q.trim() : undefined;
  const [cats, res] = await Promise.all([
    listCategories(db),
    listPublishedArticles(db, {
      category: /^[a-z0-9-]+$/.test(sp.categoria ?? "") ? sp.categoria : undefined,
      q,
      page,
      pageSize: 12,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const href = (o: Partial<Record<keyof SP, string | undefined>>) => {
    const params = new URLSearchParams();
    const m = { categoria: sp.categoria, q, pagina: undefined, ...o };
    for (const [k, v] of Object.entries(m)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `/noticias?${s}` : "/noticias";
  };

  return (
    <>
      <nav aria-label="Categorías" className="mt-8 flex flex-wrap gap-2">
        <Link
          href={href({ categoria: undefined })}
          aria-current={!sp.categoria ? "true" : undefined}
          className="chip"
          style={{ ["--cover" as string]: "#c6ff00" }}
        >
          <span>Todas</span>
        </Link>
        {cats.map((c) => (
          <Link
            key={c.id}
            href={href({ categoria: c.slug })}
            aria-current={sp.categoria === c.slug ? "true" : undefined}
            className="chip"
            style={{ ["--cover" as string]: "#c6ff00" }}
          >
            <span>{c.name}</span>
          </Link>
        ))}
      </nav>

      <form action="/noticias" role="search" className="mt-6 flex max-w-xl gap-3">
        {sp.categoria && <input type="hidden" name="categoria" value={sp.categoria} />}
        <label htmlFor="q" className="sr-only">
          Buscar noticias
        </label>
        <input id="q" name="q" defaultValue={q} placeholder="Buscar…" minLength={2} className="input rounded-full" />
        <button type="submit" className="btn btn-accent">
          Buscar
        </button>
      </form>

      <p className="mono mt-6 text-muted" role="status">
        {res.total} {res.total === 1 ? "resultado" : "resultados"}
        {q ? ` para «${q}»` : ""}
      </p>

      {res.items.length === 0 ? (
        <p className="py-16 text-muted">No encontramos noticias con esos filtros.</p>
      ) : (
        <ul className="grid12 mt-6 gap-y-10">
          {res.items.map((a, i) => (
            <li
              key={a.id}
              className={`hover-host col-span-12 sm:col-span-6 ${i === 0 && page === 1 ? "lg:col-span-8" : "lg:col-span-4"}`}
            >
              <article>
                <ArticleCover s={a} ratio={i === 0 && page === 1 ? "16 / 9" : "4 / 3"} />
                <p className="mono muted mt-3 flex flex-wrap gap-x-3">
                  <span className="text-fg">{a.kicker ?? a.categoryName}</span>
                  <span>{formatShortDate(a.publishedAt)}</span>
                  {a.readMinutes && <span>{a.readMinutes} min</span>}
                </p>
                <h2
                  className={`mt-2 font-bold leading-[1.1] ${i === 0 && page === 1 ? "display text-[clamp(1.8rem,3.4vw,3rem)]" : "text-[1.35rem]"}`}
                >
                  <Link href={`/noticias/${a.slug}`} className="stretch">
                    <span className="sweep">{a.title}</span>
                  </Link>
                </h2>
                {a.dek && <p className="mt-2 max-w-[60ch] text-muted">{a.dek}</p>}
              </article>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Paginación" className="mono mt-12 flex items-center gap-5 border-t border-line pt-6">
          {page > 1 && (
            <Link href={href({ pagina: String(page - 1) })} rel="prev">
              ← Anterior
            </Link>
          )}
          <span className="text-muted">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <Link href={href({ pagina: String(page + 1) })} rel="next">
              Siguiente →
            </Link>
          )}
        </nav>
      )}
    </>
  );
}

export default function NewsPage(props: { searchParams: Promise<SP> }) {
  return (
    <div className="wrap pt-10">
      <p className="mono text-accent-ink">Archivo</p>
      <h1 className="display t-xl mt-1">Noticias</h1>
      <Suspense fallback={<div className="mt-8 h-96" aria-busy="true" />}>
        <Listing searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
