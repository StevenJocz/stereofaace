import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { listUpcomingEvents } from "@/modules/events/service";
import { listGenres } from "@/modules/taxonomy/service";
import { COUNTRIES } from "@/ui/admin/countries";
import { EventCardView } from "@/ui/EventCardView";

export const metadata: Metadata = {
  title: "Agenda · StereoFace",
  description: "Festivales, conciertos, raves y fechas de gira en Colombia y Latinoamérica: lugar, cartel, imágenes y enlace oficial de entradas.",
  alternates: { canonical: `${SITE_URL}/agenda` },
};

type SP = { pais?: string; ciudad?: string; genero?: string };

async function Events({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const db = await getDb();
  const clean = (v: string | undefined) => (v && v.length <= 100 ? v : undefined);
  const country = sp.pais && /^[A-Za-z]{2}$/.test(sp.pais) ? sp.pais.toUpperCase() : undefined;
  const genre = sp.genero && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sp.genero) ? sp.genero : undefined;
  const [items, genres] = await Promise.all([listUpcomingEvents(db, { country, city: clean(sp.ciudad), genre, limit: 60 }), listGenres(db)]);
  const filtered = Boolean(country || sp.ciudad || genre);

  return (
    <>
      <form method="get" className="mt-8 flex flex-wrap items-end gap-3" aria-label="Filtros de la agenda">
        <label className="block">
          <span className="mono muted block text-[0.66rem]">País</span>
          <select name="pais" className="input !py-2" defaultValue={country ?? ""}>
            <option value="">Todos</option>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mono muted block text-[0.66rem]">Ciudad</span>
          <input name="ciudad" className="input !py-2" maxLength={100} defaultValue={sp.ciudad ?? ""} placeholder="Ej.: Bogotá" />
        </label>
        <label className="block">
          <span className="mono muted block text-[0.66rem]">Género</span>
          <select name="genero" className="input !py-2" defaultValue={genre ?? ""}>
            <option value="">Todos</option>
            {genres.map((g) => (
              <option key={g.id} value={g.slug}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-accent !py-2">
          Filtrar
        </button>
        {filtered && (
          <Link href="/agenda" className="btn !py-2">
            Quitar filtros
          </Link>
        )}
      </form>
      {items.length === 0 ? (
        <p className="mt-10 text-muted">{filtered ? "No hay eventos con esos filtros." : "Todavía no hay eventos próximos publicados."}</p>
      ) : (
        <>
          <p className="mono muted mt-8">
            {items.length} {items.length === 1 ? "fecha" : "fechas"}
          </p>
          <ul className="mt-4 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((e) => (
              <li key={e.id}>
                <EventCardView e={e} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export default function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <div className="wrap pt-8 pb-24">
      <nav aria-label="Migas de pan" className="mono text-muted">
        <Link href="/" className="hover:text-accent-ink">
          Inicio
        </Link>{" "}
        / Agenda
      </nav>
      <h1 className="display mt-6 text-[clamp(2.4rem,6vw,5.5rem)]">Agenda</h1>
      <p className="mt-4 max-w-[60ch] text-muted">Festivales, conciertos, raves y fechas de gira. Entra a cada evento para ver el lugar, el cartel, las imágenes y el enlace oficial de entradas.</p>
      <Suspense fallback={<div className="h-[50vh]" aria-busy="true" />}>
        <Events searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
