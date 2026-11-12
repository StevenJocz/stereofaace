"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** La señal está sonando ahora mismo. */
  active: boolean;
  /** La emisora actual permite leer datos de audio (CORS o hls.js). */
  analysable: boolean;
  /** La persona silenció o bajó el volumen a 0: el analizador no recibe señal por decisión suya. */
  silenced: boolean;
  getAnalyser: () => AnalyserNode | null;
};

type VizState = "none" | "analyzing" | "live" | "blocked" | "silenced" | "reduced";

const LABEL: Record<VizState, string> = {
  none: "Visualizador no disponible para esta emisora",
  analyzing: "Analizando señal…",
  live: "Audio real",
  blocked: "Sin acceso a datos de audio",
  silenced: "Silenciado",
  reduced: "Visualizador en pausa (movimiento reducido)",
};

const BARS = 44;

/**
 * Visualizador con datos REALES del AnalyserNode. Si la emisora no permite leer el audio (sin CORS) o el
 * analizador no recibe señal, lo dice con claridad en vez de dibujar una animación decorativa.
 */
export function Visualizer({ active, analysable, silenced, getAnalyser }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Resultado medido por el bucle de dibujo; el resto de estados se derivan de las propiedades.
  const [measured, setMeasured] = useState<"live" | "blocked" | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;

    const clear = () => ctx2d.clearRect(0, 0, cv.width, cv.height);

    if (!analysable || reduced || !active) {
      clear();
      return;
    }

    const analyser = getAnalyser();
    if (!analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const startedAt = performance.now();
    let seen = false;
    let raf = 0;
    let current: "analyzing" | "live" | "blocked" = "analyzing";

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { clientWidth: w, clientHeight: h } = cv;
      if (cv.width !== w * dpr || cv.height !== h * dpr) {
        cv.width = w * dpr;
        cv.height = h * dpr;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (document.visibilityState !== "visible") return;
      analyser.getByteFrequencyData(data);
      let max = 0;
      for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];

      let next = current;
      if (max > 0) {
        seen = true;
        next = "live";
      } else if (!seen && !silenced && performance.now() - startedAt > 3500) next = "blocked";
      if (next !== current) {
        current = next;
        if (next !== "analyzing") setMeasured(next);
      }

      const { width: W, height: H } = cv;
      ctx2d.clearRect(0, 0, W, H);
      if (!seen) return;
      const g = ctx2d.createLinearGradient(0, H, 0, 0);
      g.addColorStop(0, "#9b6bff");
      g.addColorStop(1, "#c6ff00");
      ctx2d.fillStyle = g;
      const gap = Math.max(2, W / BARS / 4);
      const bw = (W - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        const a = Math.floor(Math.pow(i / BARS, 1.7) * data.length * 0.8);
        const b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / BARS, 1.7) * data.length * 0.8));
        let sum = 0;
        for (let k = a; k < b; k++) sum += data[k];
        const v = sum / (b - a) / 255;
        const h = Math.max(2, v * H);
        ctx2d.fillRect(i * (bw + gap), H - h, bw, h);
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      setMeasured(null);
    };
  }, [active, analysable, silenced, reduced, getAnalyser]);

  const state: VizState = !analysable
    ? "none"
    : reduced
      ? "reduced"
      : !active
        ? silenced
          ? "silenced"
          : "none"
        : (measured ?? (silenced ? "silenced" : "analyzing"));

  return (
    <div className="relative h-full min-h-10 w-full" role="img" aria-label={`Visualizador de audio: ${LABEL[state]}`}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <p
        className={`mono absolute bottom-0 right-0 text-[0.62rem] ${state === "live" ? "text-accent-ink" : "text-muted"} ${
          state === "live" ? "" : "left-0 flex h-full items-center justify-center text-center"
        }`}
      >
        {state === "live" && (
          <span aria-hidden="true" className="mr-1 inline-block size-1.5 rounded-full bg-accent align-middle" />
        )}
        {LABEL[state]}
      </p>
    </div>
  );
}
