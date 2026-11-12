"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

declare global {
  interface Window {
    __sfMotion?: boolean;
  }
}

/**
 * Movimiento global del portal (el hero y el intro tienen su propio componente).
 *  - [data-reveal]       entrada desde abajo con opacidad (data-delay opcional).
 *  - .mask > .mask-in    titulares que suben desde una máscara (transición CSS, GSAP decide cuándo).
 *  - [data-clip]         imagen que se destapa con clip-path; el hijo hace un zoom suave.
 *  - [data-parallax]     desplazamiento ligado al scroll (valor = factor).
 *  - [data-count-to]     contador numérico.
 *  - .ticker-track       se inclina según la velocidad del scroll.
 *  - [data-magnetic]     el elemento sigue ligeramente al puntero.
 * Con prefers-reduced-motion el script de arranque nunca añade `motion-ok` y este
 * componente no hace nada: todo queda visible y estático desde el inicio.
 */
export function MotionRoot() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("motion-ok")) return;
    window.__sfMotion = true;
    gsap.registerPlugin(ScrollTrigger);

    let ctx: gsap.Context | undefined;
    const cleanups: Array<() => void> = [];

    /** Ejecuta `play` una vez al entrar en pantalla; también si la página carga ya desplazada. */
    const once = (el: Element, play: () => void, start = "top 92%") => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        play();
      };
      const st = ScrollTrigger.create({ trigger: el, start, onEnter: run });
      if (st.progress > 0 || st.isActive) run();
    };

    const start = () => {
      ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          const delay = Number(el.dataset.delay ?? 0);
          once(el, () => gsap.to(el, { opacity: 1, y: 0, duration: 0.95, delay, ease: "power3.out" }));
        });

        gsap.utils.toArray<HTMLElement>(".mask").forEach((el) => {
          const siblings = Array.from(el.parentElement?.children ?? []);
          el.style.setProperty("--i", String(Math.max(0, siblings.indexOf(el))));
          once(el, () => el.classList.add("is-in"));
        });

        gsap.utils.toArray<HTMLElement>("[data-clip]").forEach((el) => {
          const inner = el.firstElementChild;
          const delay = Number(el.dataset.delay ?? 0);
          once(el, () => {
            gsap.fromTo(
              el,
              { clipPath: "inset(0% 0% 100% 0%)" },
              { clipPath: "inset(0% 0% 0% 0%)", duration: 1.1, delay, ease: "expo.out" },
            );
            if (inner) gsap.fromTo(inner, { scale: 1.3 }, { scale: 1, duration: 1.6, delay, ease: "power3.out" });
          });
        });

        gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
          const f = Number(el.dataset.parallax ?? 0.1);
          gsap.fromTo(
            el,
            { y: () => -f * 120 },
            {
              y: () => f * 120,
              ease: "none",
              scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 },
            },
          );
        });

        gsap.utils.toArray<HTMLElement>("[data-count-to]").forEach((el) => {
          const to = Number(el.dataset.countTo);
          const o = { v: 0 };
          once(el, () =>
            gsap.to(o, {
              v: to,
              duration: 1.6,
              ease: "power2.out",
              onUpdate: () => (el.textContent = String(Math.round(o.v)).padStart(2, "0")),
            }),
          );
        });

        // Ticker: inclinación según velocidad de scroll
        const tracks = gsap.utils.toArray<HTMLElement>(".ticker-track");
        if (tracks.length) {
          const skew = gsap.quickTo(tracks, "skewX", { duration: 0.5, ease: "power3.out" });
          ScrollTrigger.create({
            onUpdate: (self) => skew(gsap.utils.clamp(-10, 10, self.getVelocity() / -260)),
          });
        }
      });

      // Botones magnéticos (solo puntero fino)
      if (window.matchMedia("(pointer: fine)").matches) {
        document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
          const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
          const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
          const move = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            x((e.clientX - (r.left + r.width / 2)) * 0.28);
            y((e.clientY - (r.top + r.height / 2)) * 0.28);
          };
          const leave = () => {
            x(0);
            y(0);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerleave", leave);
          cleanups.push(() => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerleave", leave);
          });
        });
      }
    };

    // Si la página tiene contenido en streaming (Suspense), espera a que se hidrate: un <MotionReady>
    // dentro de ese contenido avisa con `sf:ready`. Seguro de 4 s por si el aviso no llega.
    const begin = () => {
      if (document.querySelector("[data-motion-wait]")) {
        const fallback = window.setTimeout(start, 4000);
        window.addEventListener(
          "sf:ready",
          () => {
            window.clearTimeout(fallback);
            start();
          },
          { once: true },
        );
      } else start();
    };
    const timer = window.setTimeout(() => {
      if (document.readyState === "complete") begin();
      else window.addEventListener("load", begin, { once: true });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("load", begin);
      cleanups.forEach((c) => c());
      ctx?.revert();
    };
  }, []);

  return null;
}
