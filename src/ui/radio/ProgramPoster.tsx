import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicProgramInfo } from "@/modules/schedule/public";
import { StereoImage } from "../StereoImage";
import { groupWeekly, tapeLabel } from "./program-format";

/** Imagen del programa con acabado de cartel: color del programa, trama de puntos y, sin foto, la inicial gigante. */
export function PosterImage({ p, ratio = "4 / 5", priority = false }: { p: Pick<PublicProgramInfo, "name" | "imageUrl" | "color">; ratio?: string; priority?: boolean }) {
  return (
    <div className="prog-media" style={{ ["--pc" as string]: p.color } as CSSProperties}>
      <StereoImage ratio={ratio}>
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
          <img src={p.imageUrl} alt={p.name} className="prog-img" loading={priority ? "eager" : "lazy"} />
        ) : (
          <span className="prog-initial" aria-hidden="true">
            {p.name.slice(0, 1)}
          </span>
        )}
      </StereoImage>
      <span className="prog-tint" aria-hidden="true" />
      <span className="prog-dots" aria-hidden="true" />
    </div>
  );
}

/** Tarjeta de la lista de programas: cartel de calle con número, cinta de estado, nombre subrayado y horario. */
export function ProgramCard({ p, index, now }: { p: PublicProgramInfo; index: number; now: Date }) {
  const tape = tapeLabel(p, now);
  const groups = groupWeekly(p.weekly);
  return (
    <li className="prog-card stereo-host hover-host col-span-12 sm:col-span-6 lg:col-span-4" style={{ ["--pc" as string]: p.color } as CSSProperties}>
      <div className="relative">
        <PosterImage p={p} />
        <span className="prog-no mono" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        {tape && (
          <span className="prog-tape mono" data-live={p.onAir}>
            {p.onAir && <span className="prog-dot" aria-hidden="true" />}
            {tape}
          </span>
        )}
      </div>
      <h2 className="prog-name display-up">
        <Link href={`/programas/${p.slug}`} className="stretch">
          <span>{p.name}</span>
        </Link>
      </h2>
      {p.hosts && <p className="prog-by mono">Con {p.hosts}</p>}
      {p.description && <p className="prog-desc">{p.description}</p>}
      {groups.length > 0 && (
        <ul className="prog-when mono" aria-label="Horario semanal">
          {groups.map((g) => (
            <li key={`${g.start}-${g.end}`}>
              {g.days.join(" · ")} <b>{g.start}–{g.end}</b>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
