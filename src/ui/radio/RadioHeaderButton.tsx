"use client";

import { useRadio } from "./RadioProvider";

/** Botón «Radio en vivo» de la cabecera: reproduce/pausa la emisora actual (gesto de la persona). */
export function RadioHeaderButton() {
  const r = useRadio();
  if (!r.loaded || r.stations.length === 0) return null;
  const playing = r.status === "playing" || r.status === "loading" || r.status === "reconnecting";
  return (
    <button
      type="button"
      onClick={r.toggle}
      className="btn !gap-2 !px-3 !py-2 sm:!px-4"
      aria-pressed={playing}
      aria-label={playing ? "Pausar radio en vivo" : "Reproducir radio en vivo"}
    >
      <span aria-hidden="true" className={`inline-block size-2 rounded-full bg-accent ${playing ? "live-dot" : ""}`} />
      <span className="hidden sm:inline">Radio en vivo</span>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        {playing ? (
          <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
        ) : (
          <path d="M8 5v14l11-7z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}
