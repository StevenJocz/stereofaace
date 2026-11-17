"use client";

import { YoutubeEmbed } from "./YoutubeEmbed";
import { useCabinStatus } from "./useCabinStatus";

/** Página /cabina: el directo mudo, o un estado de «Cabina fuera del aire». */
export function CabinStage() {
  const status = useCabinStatus(10_000);
  if (status?.live) {
    return (
      <div>
        <p className="cabin-badge">
          <span className="cabin-dot" aria-hidden="true" /> EN VIVO
        </p>
        <YoutubeEmbed videoId={status.videoId} title="Cabina de StereoFace Radio en vivo (sin audio)" className="cabin-stage" />
        <p className="mono muted mt-3">El video no lleva audio: escucha la señal de StereoFace Radio en la barra inferior.</p>
      </div>
    );
  }
  return (
    <div className="cabin-off cabin-stage" role="status">
      <p className="mono text-accent-ink">{status === null ? "Conectando con la cabina…" : "Cabina fuera del aire"}</p>
      <p className="display-up text-[clamp(1.6rem,4vw,2.6rem)] leading-none">{status === null ? " " : "Volvemos pronto"}</p>
      <p className="muted mt-2 max-w-md text-[0.95rem]">Cuando un locutor active la cámara, la cabina aparece aquí en vivo. Mientras tanto, la radio sigue sonando.</p>
    </div>
  );
}
