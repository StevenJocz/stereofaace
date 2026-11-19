"use client";

import { useEffect, useRef, useState } from "react";
import { parseYouTube } from "@/modules/spaces/design";
import { playerStateOf, YT_ENDED, YT_PLAYING } from "./youtube-events";

const KEY = "sf-studio-yt";
type Recent = { id: string; at: number };

const readRecent = (): Recent[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as Recent[]).filter((r) => r && typeof r.id === "string" && /^[A-Za-z0-9_-]{11}$/.test(r.id)).slice(0, 8) : [];
  } catch {
    return [];
  }
};

/**
 * Reproductor de YouTube del estudio: el DJ pega el enlace de un pedido y lo escucha con el reproductor OFICIAL incrustado.
 * Suena solo en este equipo (para comprobar el pedido); no se mezcla ni sale al aire, y los anuncios los decide YouTube
 * (sin anuncios con YouTube Premium en este navegador). El iframe se construye solo desde el id validado del video.
 */
export function YouTubePanel({ seed, onEnded }: { seed?: { text: string; n: number } | null; onEnded?: () => void }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [follow, setFollow] = useState(true);
  const frame = useRef<HTMLIFrameElement>(null);
  const followRef = useRef(follow);
  const endedRef = useRef(onEnded);
  useEffect(() => {
    followRef.current = follow;
    endedRef.current = onEnded;
  });

  // Avisa cuando el video termina (API de mensajes del reproductor oficial) para seguir con la cola del estudio.
  useEffect(() => {
    if (!videoId) return;
    let fired = false;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== "https://www.youtube.com" || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      const state = playerStateOf(e.data);
      if (state === YT_PLAYING) fired = false; // volvió a sonar
      if (state === YT_ENDED && !fired) {
        fired = true;
        if (followRef.current) endedRef.current?.();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [videoId]);

  useEffect(() => {
    setRecent(readRecent()); // eslint-disable-line react-hooks/set-state-in-effect -- el historial solo existe en el navegador
  }, []);
  useEffect(() => {
    if (seed?.text) setSearch(seed.text); // eslint-disable-line react-hooks/set-state-in-effect -- precarga la búsqueda desde un pedido
  }, [seed]);

  const play = (id: string) => {
    setVideoId(id);
    setError(null);
    const next = [{ id, at: Date.now() }, ...readRecent().filter((r) => r.id !== id)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* el historial es solo una comodidad */
    }
  };

  const load = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseYouTube(input.trim());
    if (!id) return setError("Pega el enlace de un video de YouTube (youtube.com/watch?v=…, youtu.be/… o Shorts).");
    play(id);
    setInput("");
  };

  const q = search.trim();
  return (
    <section className="studio-voice panel" aria-label="YouTube">
      <h2 className="display-up text-[1.15rem]">YouTube</h2>
      <p className="mono muted mt-1 text-[0.66rem]">Para escuchar y comprobar un pedido. Suena solo en este equipo: no sale al aire.</p>

      <form onSubmit={load} className="mt-3 flex flex-wrap gap-2">
        <input className="input !py-2 min-w-[12rem] flex-1" inputMode="url" placeholder="Pega el enlace del video de YouTube" aria-label="Enlace de YouTube" value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" className="btn btn-accent !py-2" disabled={!input.trim()}>
          Cargar
        </button>
      </form>
      {error && (
        <p role="alert" className="mono mt-1 text-[0.7rem] text-[#ff8a8a]">
          {error}
        </p>
      )}

      {videoId ? (
        <div className="mt-3">
          <iframe
            key={videoId}
            ref={frame}
            src={`https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(typeof window === "undefined" ? "" : window.location.origin)}`}
            onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "https://www.youtube.com")}
            title="Reproductor de YouTube"
            className="aspect-video w-full rounded-[10px] border border-line bg-black"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            allow="encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <label className="mt-2 flex items-center gap-2 text-[0.8rem]">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            Al terminar el video, seguir con la cola
          </label>
          <div className="mt-1.5 flex flex-wrap gap-3">
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="mono text-[0.66rem] text-accent-ink underline">
              Abrir en YouTube ↗
            </a>
            <button type="button" className="mono text-[0.66rem] text-muted underline" onClick={() => setVideoId(null)}>
              Cerrar reproductor
            </button>
          </div>
        </div>
      ) : (
        <p className="studio-empty !mt-3 !py-3">Pega un enlace y pulsa Cargar. El video no arranca solo: pulsa play cuando quieras.</p>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <p className="mono text-[0.66rem] text-accent-ink">Buscar un pedido en YouTube</p>
        <form
          className="mt-1.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q) window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
          }}
        >
          <input className="input !py-2 min-w-[12rem] flex-1" placeholder="Título y artista" aria-label="Qué buscar en YouTube" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={140} />
          <button type="submit" className="btn !py-2" disabled={!q}>
            Buscar ↗
          </button>
        </form>
        <p className="mono muted mt-1 text-[0.62rem]">Se abre YouTube en otra pestaña: copia el enlace del video y pégalo arriba.</p>
      </div>

      {recent.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mono text-[0.66rem] text-accent-ink">Recientes</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" className="btn !px-2.5 !py-0.5 !text-[0.66rem]" onClick={() => play(r.id)} aria-label={`Volver a cargar el video ${r.id}`}>
                  ▶ {r.id}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
