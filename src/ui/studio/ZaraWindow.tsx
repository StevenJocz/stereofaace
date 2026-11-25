"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Reloj que se actualiza solo (ms desde 1970). Vale 0 hasta montarse en el navegador: así el HTML del servidor y el primer
 * pintado del cliente coinciden (la hora del servidor no sirve) y no hay desajuste de hidratación.
 */
export function useClock(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

/** Ventana del estudio con barra de título de color (azul: eventos y explorador; rojo: lista principal). */
export function ZaraWindow({ title, tone, actions, className = "", children }: { title: ReactNode; tone: "blue" | "red"; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`zs-win ${className}`} data-tone={tone}>
      <header className="zs-win-bar">
        <h2 className="zs-win-title">{title}</h2>
        {actions}
      </header>
      <div className="zs-win-body">{children}</div>
    </section>
  );
}

/** Nivel L/R con bandas verde → amarillo → rojo, como los medidores de ZaraStudio. */
export function VuBar({ db, label }: { db: number; label: string }) {
  const pct = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
  return (
    <div role="meter" aria-label={label} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(Math.max(-60, db))} className="zs-vu">
      <i style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }} />
    </div>
  );
}

/** Medidor que consulta su propio nivel (solo él se vuelve a dibujar). */
export function PollVu({ read, label, intervalMs = 60 }: { read: () => number; label: string; intervalMs?: number }) {
  const [db, setDb] = useState(-100);
  useEffect(() => {
    const t = setInterval(() => setDb(read()), intervalMs);
    return () => clearInterval(t);
  }, [read, intervalMs]);
  return <VuBar db={db} label={label} />;
}
