import type { ReactNode } from "react";

type Props = {
  /** Contenido visual (portada). Se renderiza una vez por canal. */
  children: ReactNode;
  className?: string;
  /** Proporción CSS, p. ej. "4 / 5". */
  ratio?: string;
};

/**
 * Motivo de la marca: la imagen se divide en canal L y canal R.
 * En hover (en un ancestro .stereo-host) las mitades se separan y se alinean al salir.
 * El segundo canal es decorativo y se oculta a lectores de pantalla.
 */
export function StereoImage({ children, className = "", ratio = "4 / 5" }: Props) {
  return (
    <div className={`stereo ${className}`} style={{ aspectRatio: ratio }}>
      <div className="ch ch-l">{children}</div>
      <div className="ch ch-r" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
