"use client";

import { useEffect, useState } from "react";

export type CabinStatus = { live: false } | { live: true; videoId: string; title: string };

const PATH = "/api/video/status";

/** ¿Hay directo en cabina? Consulta cada `everyMs` solo con la pestaña visible; si falla, se considera fuera del aire. */
export function useCabinStatus(everyMs = 20_000): CabinStatus | null {
  const [status, setStatus] = useState<CabinStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch(PATH, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<CabinStatus>) : { live: false as const }))
        .catch(() => ({ live: false as const }))
        .then((s) => alive && setStatus(s));
    };
    load();
    const t = setInterval(load, everyMs);
    document.addEventListener("visibilitychange", load);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", load);
    };
  }, [everyMs]);
  return status;
}
