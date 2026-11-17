import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { listPublicPrograms } from "@/modules/schedule/public";
import { ProgramCard } from "@/ui/radio/ProgramPoster";
import { Sk } from "@/ui/Skeleton";

export const metadata: Metadata = {
  title: "Programas · StereoFace Radio",
  description: "Los programas de StereoFace Radio: quién los hace, de qué van y cuándo salen al aire.",
  alternates: { canonical: `${SITE_URL}/programas` },
};

async function ProgramGrid() {
  await connection();
  const now = new Date();
  const items = await listPublicPrograms(await getDb(), now);
  if (items.length === 0) return <p className="mt-10 text-muted">Pronto publicaremos los programas de la radio.</p>;
  return (
    <ul className="grid12 mt-10 gap-y-12">
      {items.map((p, i) => (
        <ProgramCard key={p.slug} p={p} index={i} now={now} />
      ))}
    </ul>
  );
}

function GridSkeleton() {
  return (
    <ul className="grid12 mt-10 gap-y-12" aria-busy="true" aria-label="Cargando programas">
      {[0, 1, 2].map((i) => (
        <li key={i} className="col-span-12 sm:col-span-6 lg:col-span-4">
          <Sk className="w-full" style={{ aspectRatio: "4 / 5", borderRadius: 10 }} />
          <Sk className="mt-4 h-8 w-3/4" />
          <Sk className="mt-2 h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

export default function ProgramsPage() {
  return (
    <div className="wrap pt-8 pb-16">
      <nav aria-label="Migas de pan" className="mono text-muted">
        <Link href="/" className="hover:text-accent-ink">
          Inicio
        </Link>{" "}
        / Programas
      </nav>
      <p className="mono mt-8 text-accent-ink">StereoFace Radio · parrilla</p>
      <h1 className="display-up mt-2 text-[clamp(2.6rem,8vw,6.5rem)] leading-[0.9]">Programas</h1>
      <p className="mt-4 max-w-[58ch] text-muted">Voces, sets y escenas que suenan en cabina. Entra a cada programa para ver quién lo hace y cuándo sale al aire.</p>
      <Suspense fallback={<GridSkeleton />}>
        <ProgramGrid />
      </Suspense>
    </div>
  );
}
