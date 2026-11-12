"use client";

import { useEffect, useState } from "react";
import type { NowPlaying } from "@/modules/schedule/public";

/** Slug de la emisora propia: solo ella muestra programa y programación. */
export const OWN_STATION_SLUG = "stereoface-radio";

/** Programa que está al aire según la parrilla (se refresca cada minuto). Solo consulta si `enabled`. */
export function useNowPlayingProgram(enabled: boolean): NowPlaying | null {
  const [now, setNow] = useState<NowPlaying | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetch("/api/radio/now")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { now: NowPlaying | null } | null) => alive && setNow(d?.now ?? null))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return enabled ? now : null;
}
