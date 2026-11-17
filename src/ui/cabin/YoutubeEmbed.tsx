"use client";

import { useEffect, useRef } from "react";
import { MUTE_COMMAND, YT_ORIGIN, cabinEmbedSrc } from "./youtube-embed";

/**
 * Directo de la cabina con el reproductor oficial de YouTube, siempre silenciado: parámetros `mute=1`, sin controles,
 * una capa transparente que impide pulsar el reproductor y la orden «mute» reenviada cada pocos segundos.
 * No toca el reproductor de radio ni su audio.
 */
export function YoutubeEmbed({ videoId, title, className = "" }: { videoId: string; title: string; className?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const src = cabinEmbedSrc(videoId);

  useEffect(() => {
    const send = () => frame.current?.contentWindow?.postMessage(MUTE_COMMAND, YT_ORIGIN);
    send();
    const t = setInterval(send, 2000);
    return () => clearInterval(t);
  }, [videoId]);

  if (!src) return null;
  return (
    <div className={`cabin-frame ${className}`}>
      <iframe
        ref={frame}
        src={src}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="autoplay; encrypted-media; picture-in-picture"
        onLoad={() => frame.current?.contentWindow?.postMessage(MUTE_COMMAND, YT_ORIGIN)}
      />
      <div className="cabin-shield" aria-hidden="true" />
    </div>
  );
}
