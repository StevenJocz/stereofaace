"use client";

import { useEffect, useRef } from "react";

const RPM_DEG_PER_SEC = 200; // 33⅓ rpm
const SPIN_UP = 4; // arranque rápido
const SPIN_DOWN = 2.2; // frenada con inercia

/** Plato de vinilo que gira mientras el deck suena, con arranque y frenada suaves y un brazo que se posa sobre el disco. */
export function VinylDisc({ playing, deck, accent, className = "" }: { playing: boolean; deck: string; accent: string; className?: string }) {
  const disc = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  const angle = useRef(0);
  const speed = useRef(0);
  const raf = useRef(0);
  const last = useRef(0);
  const reduced = useRef(false);

  useEffect(() => {
    playingRef.current = playing;
    reduced.current = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) return;
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last.current) / 1000);
      last.current = now;
      const target = playingRef.current ? RPM_DEG_PER_SEC : 0;
      speed.current += (target - speed.current) * Math.min(1, dt * (playingRef.current ? SPIN_UP : SPIN_DOWN));
      angle.current = (angle.current + speed.current * dt) % 360;
      if (disc.current) disc.current.style.transform = `rotate(${angle.current}deg)`;
      if (playingRef.current || speed.current > 0.5) raf.current = requestAnimationFrame(tick);
      else raf.current = 0;
    };
    if (!raf.current) {
      last.current = performance.now();
      raf.current = requestAnimationFrame(tick);
    }
  }, [playing]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    },
    [],
  );

  return (
    <div className={`studio-vinyl ${className}`} data-playing={playing} aria-hidden="true">
      <div className="studio-vinyl-plate" />
      <div ref={disc} className="studio-vinyl-disc">
        <svg viewBox="0 0 200 200" width="100%" height="100%" focusable="false">
          <defs>
            <radialGradient id={`vg-${deck}`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#1a1a1a" />
              <stop offset="0.35" stopColor="#0c0c0c" />
              <stop offset="1" stopColor="#050505" />
            </radialGradient>
          </defs>
          <circle cx="100" cy="100" r="98" fill={`url(#vg-${deck})`} stroke="#262626" strokeWidth="1.5" />
          {Array.from({ length: 22 }, (_, i) => (
            <circle key={i} cx="100" cy="100" r={42 + i * 2.4} fill="none" stroke="#ffffff" strokeOpacity={i % 7 === 0 ? 0.13 : 0.045} strokeWidth="0.6" />
          ))}
          {/* Marcas asimétricas: hacen visible el giro */}
          <path d="M100 100 m-78 0 a78 78 0 0 1 40 -68" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M100 100 m62 20 a64 64 0 0 1 -30 40" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M100 100 m-30 66 a72 72 0 0 0 52 14" fill="none" stroke="#fff" strokeOpacity="0.1" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="100" cy="100" r="36" fill={accent} />
          <circle cx="100" cy="100" r="36" fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1" />
          <circle cx="100" cy="100" r="29" fill="none" stroke="#000" strokeOpacity="0.2" strokeWidth="0.8" strokeDasharray="2 3" />
          <text x="100" y="112" textAnchor="middle" fontSize="34" fontWeight="900" fill="#07080a" fontFamily="inherit">
            {deck}
          </text>
          <circle cx="100" cy="72" r="2.6" fill="#07080a" />
          <circle cx="100" cy="100" r="3.2" fill="#0a0a0a" stroke="#888" strokeWidth="0.8" />
        </svg>
      </div>
      <div className="studio-vinyl-shine" />
      <svg className="studio-tonearm" viewBox="0 0 200 200" focusable="false" aria-hidden="true">
        <g>
          <circle cx="178" cy="26" r="14" fill="#1b1b1b" stroke="#3a3a3a" strokeWidth="1.5" />
          <circle cx="178" cy="26" r="5" fill="#777" />
          <path d="M178 26 L150 60 L96 128" fill="none" stroke="#bdbdbd" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="84" y="120" width="20" height="12" rx="2" fill="#2a2a2a" stroke="#555" transform="rotate(-38 94 126)" />
        </g>
      </svg>
    </div>
  );
}
