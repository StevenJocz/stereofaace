"use client";

import Link from "next/link";
import { useState } from "react";
import { YoutubeEmbed } from "./YoutubeEmbed";
import { useCabinStatus } from "./useCabinStatus";

/**
 * Aviso flotante, a la izquierda y sobre la barra de radio (que queda intacta). Solo aparece con directo:
 * una pastilla «EN VIVO · Cabina» que se despliega en un reproductor mudo. El audio sigue siendo la radio.
 */
export function CabinLive() {
  const status = useCabinStatus();
  const [open, setOpen] = useState(false);
  if (!status?.live) return null;
  return (
    <aside className="cabin-float" aria-label="Cabina en vivo">
      {open && (
        <div className="cabin-card">
          <YoutubeEmbed videoId={status.videoId} title="Cabina de StereoFace Radio en vivo (sin audio)" />
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="mono muted text-[0.68rem]">Sin audio · escucha la radio</p>
            <Link href="/cabina" className="mono text-accent-ink text-[0.7rem]">
              Ver grande →
            </Link>
          </div>
        </div>
      )}
      <button type="button" className="cabin-pill" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="cabin-dot" aria-hidden="true" />
        <span className="mono">EN VIVO · Cabina</span>
        <span aria-hidden="true">{open ? "✕" : "▸"}</span>
      </button>
    </aside>
  );
}
