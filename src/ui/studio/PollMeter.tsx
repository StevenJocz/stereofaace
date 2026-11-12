"use client";

import { useEffect, useState } from "react";
import { MeterBar } from "./MeterBar";

/** Medidor que consulta su propio nivel y solo él se vuelve a dibujar (la consola entera no se re-renderiza). */
export function PollMeter({ read, label, className = "", intervalMs = 70 }: { read: () => number; label: string; className?: string; intervalMs?: number }) {
  const [db, setDb] = useState(-100);
  useEffect(() => {
    const t = setInterval(() => setDb(read()), intervalMs);
    return () => clearInterval(t);
  }, [read, intervalMs]);
  return <MeterBar db={db} label={label} className={className} />;
}

/** Texto numérico que se actualiza solo (p. ej. la reducción actual del ducking). */
export function PollValue({ read, format, intervalMs = 150 }: { read: () => number; format: (v: number) => string; intervalMs?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setV(read()), intervalMs);
    return () => clearInterval(t);
  }, [read, intervalMs]);
  return <>{format(v)}</>;
}
