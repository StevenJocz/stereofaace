"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Art, type Scene, type Tone } from "./Art";
import { HeroFigure } from "./HeroFigure";

const DURATION = 6.5; // segundos por slide

export type HeroSlideView = {
  id: string;
  path: [string, string, string];
  lines: string[];
  /** Índice de la primera línea que va en color de acento. */
  accentFrom: number;
  phrase?: string;
  dek: string;
  tone: Tone;
  art: "figure" | Scene;
  seed: number;
  coverUrl?: string;
  coverAlt?: string;
  cta: string;
  href: string;
  meta: string;
  place: string;
  isDemo: boolean;
};

type Props = { slides: HeroSlideView[] };

/**
 * Carrusel de portada.
 *  - HTML completo desde el servidor; el primer slide es legible sin JavaScript.
 *  - GSAP dirige la entrada, las transiciones y el parallax del puntero.
 *  - Con prefers-reduced-motion no hay autoplay ni transiciones: solo cambio de slide.
 *  - Pausa por botón, por hover/foco y al ocultar la pestaña (WCAG 2.2.2).
 */
export function HeroSlider({ slides }: Props) {
  const root = useRef<HTMLElement>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  const s = useRef({
    index: 0,
    busy: false,
    motion: false,
    playing: true,
    hovered: false,
    prog: null as gsap.core.Tween | null,
    go: (() => {}) as (to: number) => void,
  });

  useEffect(() => {
    s.current.playing = playing;
    const st = s.current;
    if (!st.prog) return;
    if (playing && !st.hovered) st.prog.resume();
    else st.prog.pause();
  }, [playing]);

  const go = useCallback((to: number) => s.current.go(to), []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const st = s.current;
    const n = slides.length;
    st.motion = document.documentElement.classList.contains("motion-ok");

    const slideEls = Array.from(el.querySelectorAll<HTMLElement>("[data-slide]"));
    const bars = Array.from(el.querySelectorAll<HTMLElement>("[data-bar] > i"));
    const q = (slide: HTMLElement, sel: string) => Array.from(slide.querySelectorAll<HTMLElement>(sel));

    const ctx = gsap.context(() => {
      const startProgress = (i: number) => {
        st.prog?.kill();
        gsap.set(bars, { scaleX: (j: number) => (j < i ? 1 : 0), transformOrigin: "left" });
        if (!st.motion) return;
        st.prog = gsap.fromTo(
          bars[i],
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: DURATION,
            ease: "none",
            transformOrigin: "left",
            paused: !st.playing || st.hovered,
            onComplete: () => st.go((i + 1) % n),
          },
        );
      };

      const enter = (slide: HTMLElement, first = false) => {
        const lines = q(slide, ".hero-line > span");
        const fades = q(slide, ".hf");
        const art = q(slide, "[data-scale]");
        const disc = q(slide, '[data-art="disc"], [data-art="groove"], [data-art="ring"]');
        const beams = q(slide, '[data-art="beam"], [data-art="bar"]');
        const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
        tl.fromTo(
          lines,
          { yPercent: 115, autoAlpha: 0 },
          { yPercent: 0, autoAlpha: 1, duration: 1.05, stagger: 0.08 },
          0.05,
        )
          .fromTo(fades, { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.07 }, 0.3)
          .fromTo(
            art,
            { scale: 1.14, autoAlpha: 0 },
            { scale: 1, autoAlpha: 1, duration: first ? 1.5 : 1.2, ease: "power3.out" },
            0,
          );
        if (disc.length)
          tl.fromTo(
            disc,
            { scale: 0.7, transformOrigin: "50% 50%", transformBox: "fill-box" },
            { scale: 1, duration: 1.4, ease: "back.out(1.5)", stagger: disc.length > 3 ? 0.012 : 0 },
            0.1,
          );
        if (beams.length)
          tl.fromTo(
            beams,
            { autoAlpha: 0 },
            {
              autoAlpha: (_i: number, t: Element) => Number(t.getAttribute("opacity") ?? 1),
              duration: 1,
              stagger: 0.03,
            },
            0.2,
          );
        return tl;
      };

      const leave = (slide: HTMLElement) => {
        const lines = q(slide, ".hero-line > span");
        const fades = q(slide, ".hf");
        const art = q(slide, "[data-scale]");
        return gsap
          .timeline({ defaults: { ease: "power3.in" } })
          .to(lines, { yPercent: -115, duration: 0.45, stagger: 0.04 }, 0)
          .to(fades, { autoAlpha: 0, y: -10, duration: 0.3 }, 0)
          .to(art, { autoAlpha: 0, scale: 1.05, duration: 0.55 }, 0);
      };

      st.go = (to: number) => {
        if (to === st.index) return;
        const from = st.index;
        if (!st.motion) {
          slideEls[from].dataset.active = "false";
          slideEls[to].dataset.active = "true";
          st.index = to;
          setIndex(to);
          return;
        }
        if (st.busy) return;
        st.busy = true;
        st.prog?.kill();
        // Si aún corría la entrada CSS del primer slide, se entrega el control a GSAP.
        slideEls[from].removeAttribute("data-first");
        setIndex(to);
        leave(slideEls[from]).eventCallback("onComplete", () => {
          slideEls[from].dataset.active = "false";
          slideEls[to].dataset.active = "true";
          st.index = to;
          enter(slideEls[to]).eventCallback("onComplete", () => {
            st.busy = false;
          });
          startProgress(to);
        });
      };

      // Entrada inicial: tras el intro si lo hay.
      let started = false;
      const begin = () => {
        if (started) return;
        started = true;
        // El slide 1 ya entró con CSS; aquí solo arranca el avance automático.
        if (st.motion) startProgress(0);
      };
      const introOn = document.documentElement.classList.contains("intro-on");
      const failsafe = window.setTimeout(begin, introOn ? 4500 : 0);
      window.addEventListener("sf:intro-done", begin, { once: true });
      if (!introOn) document.fonts?.ready.then(begin);

      // Parallax del puntero (solo con puntero fino y movimiento permitido)
      const fine = window.matchMedia("(pointer: fine)").matches;
      const onMove = (e: PointerEvent) => {
        if (!st.motion || !fine) return;
        const r = el.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        const ny = ((e.clientY - r.top) / r.height - 0.5) * 2;
        const cur = slideEls[st.index];
        gsap.to(q(cur, "[data-par]"), {
          x: nx * -16,
          y: ny * -10,
          duration: 0.9,
          ease: "power3.out",
          overwrite: "auto",
        });
        gsap.to(q(cur, "[data-par-text]"), { x: nx * 6, duration: 1, ease: "power3.out", overwrite: "auto" });
      };
      const pause = () => {
        st.hovered = true;
        st.prog?.pause();
      };
      const resume = () => {
        st.hovered = false;
        if (st.playing) st.prog?.resume();
      };
      const onVis = () => (document.hidden ? st.prog?.pause() : !st.hovered && st.playing && st.prog?.resume());
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") st.go((st.index + 1) % n);
        if (e.key === "ArrowLeft") st.go((st.index - 1 + n) % n);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerenter", pause);
      el.addEventListener("pointerleave", resume);
      el.addEventListener("focusin", pause);
      el.addEventListener("focusout", resume);
      el.addEventListener("keydown", onKey);
      document.addEventListener("visibilitychange", onVis);

      return () => {
        window.clearTimeout(failsafe);
        window.removeEventListener("sf:intro-done", begin);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerenter", pause);
        el.removeEventListener("pointerleave", resume);
        el.removeEventListener("focusin", pause);
        el.removeEventListener("focusout", resume);
        el.removeEventListener("keydown", onKey);
        document.removeEventListener("visibilitychange", onVis);
        st.prog?.kill();
      };
    }, el);

    return () => ctx.revert();
  }, [slides.length]);

  const pad = (v: number) => String(v).padStart(2, "0");

  return (
    <section
      ref={root}
      className="hero"
      aria-roledescription="carousel"
      aria-label="Historias destacadas (contenido demo)"
    >
      <div aria-live={playing ? "off" : "polite"}>
        {slides.map((sl, i) => (
          <div
            key={sl.id}
            data-slide
            data-active={i === 0}
            data-first={i === 0 ? "" : undefined}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${slides.length}`}
            className="hero-slide"
          >
            <div className="hero-art">
              <div data-par>
                <div data-scale>
                  {sl.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- puede ser una imagen editorial propia servida por /media.
                    <img src={sl.coverUrl} alt={sl.coverAlt ?? ""} className="size-full object-cover" referrerPolicy="no-referrer" />
                  ) : sl.art === "figure" ? (
                    <HeroFigure tone={sl.tone} />
                  ) : (
                    <Art scene={sl.art} tone={sl.tone} seed={sl.seed} />
                  )}
                </div>
              </div>
            </div>

            <p className="mono hero-hud hf">
              {sl.place.split(" · ").map((p) => (
                <span key={p} className="block">
                  {p}
                </span>
              ))}
            </p>

            <div className="hero-text" data-par-text>
              <p className="mono hf flex flex-wrap items-center gap-x-3">
                {sl.path.map((p, k) => (
                  <span key={p} className="flex gap-3">
                    {k > 0 && <span className="opacity-50">/</span>}
                    {p}
                  </span>
                ))}
                {sl.isDemo && <span className="tag tag-demo !text-white/60">Demo</span>}
              </p>
              <h2 className="display hero-title">
                {sl.lines.map((line, k) => (
                  <span key={k} className="hero-line" style={{ ["--k" as string]: k }}>
                    <span style={k >= sl.accentFrom ? { color: "var(--accent)" } : undefined}>{line}</span>
                  </span>
                ))}
              </h2>
              {sl.phrase && <p className="hf max-w-[38ch] text-[1.1rem] font-semibold leading-snug text-accent">{sl.phrase}</p>}
              <p className="hf max-w-[44ch] text-[0.95rem] leading-snug text-white/80">{sl.dek}</p>
              <div className="hf flex flex-wrap items-center gap-4">
                <Link href={sl.href} className="btn">
                  {sl.cta} →
                </Link>
                <span className="mono text-white/60">{sl.meta}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hero-controls">
        <span className="mono tabular-nums" aria-hidden="true">
          {pad(index + 1)} / {pad(slides.length)}
        </span>
        <div className="hero-bars" aria-hidden="true">
          {slides.map((sl) => (
            <span key={sl.id} data-bar className="hero-bar">
              <i />
            </span>
          ))}
        </div>
        <button
          type="button"
          className="btn-icon"
          aria-label="Historia anterior"
          onClick={() => go((index - 1 + slides.length) % slides.length)}
        >
          ←
        </button>
        <button
          type="button"
          className="btn-icon"
          aria-label="Historia siguiente"
          onClick={() => go((index + 1) % slides.length)}
        >
          →
        </button>
        <button
          type="button"
          className="btn-icon hero-pause"
          aria-pressed={!playing}
          aria-label={playing ? "Pausar carrusel" : "Reanudar carrusel"}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚" : "▶"}
        </button>
      </div>
    </section>
  );
}
