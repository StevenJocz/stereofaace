import type { CSSProperties } from "react";

/** Bloque de carga con brillo suave (sin movimiento si la persona prefiere menos animación). */
export function Sk({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`sk ${className}`} style={style} aria-hidden="true" />;
}

const Meta = () => <Sk className="h-3 w-40" />;

/** Esqueleto de la portada: repite la composición real (hero + recientes, riel, noticias, artistas) para que nada salte al cargar. */
export function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando portada" role="status">
      <div className="wrap pt-5 md:pt-6">
        <div className="grid12 gap-y-6">
          <div className="col-span-12 xl:col-span-9">
            <Sk className="w-full" style={{ aspectRatio: "16 / 9", minHeight: "16rem", borderRadius: 12 }} />
          </div>
          <div className="col-span-12 xl:col-span-3">
            <Sk className="h-6 w-48" />
            <ul className="mt-4 grid gap-x-6 md:grid-cols-3 xl:block">
              {[0, 1, 2].map((i) => (
                <li key={i} className="border-t border-line py-4">
                  <Meta />
                  <Sk className="mt-3 h-5 w-full" />
                  <Sk className="mt-2 h-5 w-4/5" />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Sk key={i} className="h-10 w-32 flex-none" style={{ borderRadius: 999 }} />
          ))}
        </div>
      </div>

      <div className="wrap mt-24">
        <Sk className="h-4 w-44" />
        <div className="grid12 mt-8 gap-y-10">
          <div className="col-span-12 lg:col-span-6">
            <Sk className="w-full" style={{ aspectRatio: "4 / 3", borderRadius: 12 }} />
            <div className="mt-4">
              <Meta />
              <Sk className="mt-3 h-8 w-full" />
              <Sk className="mt-2 h-8 w-3/4" />
            </div>
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="col-span-12 sm:col-span-6 lg:col-span-3">
              <Sk className="w-full" style={{ aspectRatio: "5 / 4", borderRadius: 12 }} />
              <div className="mt-3">
                <Meta />
                <Sk className="mt-2 h-6 w-full" />
                <Sk className="mt-2 h-6 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="wrap mt-24">
        <Sk className="h-4 w-32" />
        <ul className="grid12 mt-8 gap-y-10">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="col-span-6 lg:col-span-3">
              <Sk className="w-full" style={{ aspectRatio: "3 / 4", borderRadius: 8 }} />
              <Sk className="mt-3 h-6 w-3/4" />
              <Sk className="mt-2 h-3 w-1/3" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Esqueleto genérico de página interna: titular y rejilla de tarjetas. */
export function PageSkeleton() {
  return (
    <div className="wrap py-10 sm:py-14" aria-busy="true" aria-label="Cargando" role="status">
      <Sk className="h-3 w-28" />
      <Sk className="mt-4 h-12 w-3/4 max-w-xl" />
      <ul className="grid12 mt-10 gap-y-10">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="col-span-12 sm:col-span-6 lg:col-span-4">
            <Sk className="w-full" style={{ aspectRatio: "4 / 3", borderRadius: 12 }} />
            <Sk className="mt-3 h-3 w-40" />
            <Sk className="mt-3 h-6 w-full" />
            <Sk className="mt-2 h-6 w-2/3" />
          </li>
        ))}
      </ul>
    </div>
  );
}
