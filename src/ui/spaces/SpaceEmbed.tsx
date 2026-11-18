"use client";

import { useState } from "react";

/**
 * Reproductor externo (Spotify / YouTube) con «clic para cargar»: hasta que la persona lo pide no se contacta con el tercero
 * (privacidad y rapidez) y nada suena solo. El `src` lo construye el servidor desde ids validados, nunca desde texto libre.
 */
export function SpaceEmbed({ src, title, provider, ratio, height }: { src: string; title: string; provider: "Spotify" | "YouTube"; ratio?: string; height?: number }) {
  const [on, setOn] = useState(false);
  const box = ratio ? { aspectRatio: ratio } : { height };
  return (
    <div className="space-embed" data-provider={provider.toLowerCase()}>
      {on ? (
        <iframe
          src={src}
          title={title}
          style={box}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          allow="encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" className="space-embed-load" style={box} onClick={() => setOn(true)}>
          <span className="space-embed-play" aria-hidden="true">
            ▶
          </span>
          <span className="space-embed-title">{title}</span>
          <span className="space-embed-note">Cargar con {provider}</span>
        </button>
      )}
    </div>
  );
}
