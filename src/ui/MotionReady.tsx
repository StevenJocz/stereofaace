"use client";

import { useEffect, useRef } from "react";

/**
 * Se coloca dentro de contenido servido en streaming (Suspense). Mientras ese contenido no esté
 * hidratado, el marcador `data-motion-wait` indica a MotionRoot que espere; al hidratarse se retira y se
 * emite `sf:ready`. Así GSAP nunca toca nodos que React aún no ha hidratado.
 */
export function MotionReady() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.removeAttribute("data-motion-wait");
    window.dispatchEvent(new Event("sf:ready"));
  }, []);
  return <span ref={ref} data-motion-wait hidden />;
}
