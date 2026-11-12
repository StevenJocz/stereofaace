"use client";

import { useEffect, useState } from "react";
import type { FeedTrack, StationFeed } from "@/modules/radio/nowplaying";

export type StationTracks = { nowPlaying: StationFeed["nowPlaying"]; history: FeedTrack[] };

/** Lo que suena y las dos anteriores en la emisora propia (se refresca cada 15 s). Solo consulta si `enabled`. */
export function useStationTracks(enabled: boolean): StationTracks | null {
  const [tracks, setTracks] = useState<StationTracks | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetch("/api/radio/nowplaying")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: StationTracks | null) => alive && setTracks(d))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return enabled ? tracks : null;
}
