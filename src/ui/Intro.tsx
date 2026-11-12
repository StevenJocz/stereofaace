"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Intro de carga, una vez por sesión y solo en la portada. El script de arranque añade
 * `intro-on` a <html> (nunca con prefers-reduced-motion). Al terminar emite `sf:intro-done`,
 * que el hero escucha para empezar su entrada.
 */
export function Intro() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const html = document.documentElement;
    if (!el || !html.classList.contains("intro-on")) return;

    const num = el.querySelector<HTMLElement>("[data-count]");
    const counter = { v: 0 };
    const finish = () => {
      html.classList.remove("intro-on");
      try {
        sessionStorage.setItem("sf-intro", "1");
      } catch {
        /* sin almacenamiento: el intro volverá a mostrarse, sin consecuencias */
      }
      window.dispatchEvent(new Event("sf:intro-done"));
    };

    const ctx = gsap.context(() => {
      gsap
        .timeline({ onComplete: finish })
        .fromTo(
          "[data-i-bar]",
          { scaleY: 0.12 },
          {
            scaleY: () => gsap.utils.random(0.35, 1),
            duration: 0.45,
            stagger: { each: 0.025, repeat: 2, yoyo: true },
            ease: "sine.inOut",
          },
          0,
        )
        .fromTo(
          "[data-i-letter]",
          { yPercent: 115 },
          { yPercent: 0, duration: 0.9, ease: "expo.out", stagger: 0.045 },
          0.1,
        )
        .to(
          counter,
          {
            v: 100,
            duration: 1.1,
            ease: "power2.inOut",
            onUpdate: () => {
              if (num) num.textContent = String(Math.round(counter.v)).padStart(3, "0");
            },
          },
          0,
        )
        .to("[data-i-letter]", { yPercent: -115, duration: 0.5, ease: "power3.in", stagger: 0.02 }, 1.15)
        .to(el, { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "expo.inOut" }, 1.3);
    }, el);

    // No se quita `intro-on` aquí: en desarrollo React monta dos veces y el segundo montaje debe
    // poder arrancar el intro. Lo quita `finish`, o el script de arranque tras 6 s si algo falla.
    return () => ctx.revert();
  }, []);

  const word = "STEREOFACE".split("");
  return (
    <div ref={ref} className="intro" aria-hidden="true">
      <div className="flex flex-col items-center gap-6">
        <div className="flex h-16 items-center gap-[5px]">
          {Array.from({ length: 28 }).map((_, i) => (
            <span key={i} data-i-bar className="block h-full w-[4px] origin-center bg-accent" />
          ))}
        </div>
        <div className="display-wide flex overflow-hidden text-[clamp(2rem,9vw,6rem)] leading-none">
          {word.map((c, i) => (
            <span key={i} className="block overflow-hidden py-[0.06em]">
              <span data-i-letter className="block">
                {c}
              </span>
            </span>
          ))}
        </div>
        <p className="mono muted">
          Cargando · <span data-count>000</span>
        </p>
      </div>
    </div>
  );
}
