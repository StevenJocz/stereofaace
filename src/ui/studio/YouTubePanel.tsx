"use client";

import { useEffect, useState } from "react";
import { parseYouTube } from "@/modules/spaces/design";

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

export type YouTubeOnAir = {
  /** El audio de YouTube está entrando a la emisión. */
  on: boolean;
  /** Pide al navegador compartir la pestaña (con su audio) y lo mezcla en la emisión. Lanza un Error con el motivo si no se pudo. */
  share: () => Promise<void>;
  stop: () => void;
  volume: number;
  setVolume: (v: number) => void;
};

/**
 * YouTube en el estudio, para pedidos. El video NO suena aquí: el locutor lo abre en su propia pestaña de YouTube, comparte esa
 * pestaña (con su audio) y el estudio lo mezcla en la emisión; el navegador silencia esa pestaña para que no se duplique el sonido.
 * El audio entra como una pista más: pasa por el EQ, baja cuando el locutor habla y tiene su propio volumen.
 * Los anuncios los decide YouTube (sin anuncios con YouTube Premium); la música de YouTube no tiene licencia de radio.
 */
export function YouTubePanel({ seed, onAir, follow, onFollow }: { seed?: { text: string; n: number } | null; onAir: YouTubeOnAir; follow: boolean; onFollow: (v: boolean) => void }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    setRecent(readRecent()); // eslint-disable-line react-hooks/set-state-in-effect -- el historial solo existe en el navegador
  }, []);
  useEffect(() => {
    if (seed?.text) setSearch(seed.text); // eslint-disable-line react-hooks/set-state-in-effect -- precarga la búsqueda desde un pedido
  }, [seed]);

  const choose = (id: string) => {
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
    choose(id);
    setInput("");
  };

  const share = async () => {
    setBusy(true);
    setError(null);
    try {
      await onAir.share();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo compartir el audio.");
    } finally {
      setBusy(false);
    }
  };

  const q = search.trim();
  return (
    <section className="studio-voice panel" aria-label="YouTube">
      <h2 className="display-up text-[1.15rem]">YouTube al aire</h2>
      <p className="mono muted mt-1 text-[0.66rem]">El audio del video sale por la transmisión. Aquí no suena: así no se duplica el sonido.</p>

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

      {onAir.on ? (
        <div className="mt-3 rounded-[10px] border border-accent p-3" role="status">
          <p className="mono flex items-center gap-2 text-[0.7rem] text-accent-ink">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-accent live-dot" />
            AL AIRE · audio de YouTube
          </p>
          <label className="mt-2 flex items-center gap-3 text-[0.8rem]">
            <span className="mono text-[0.66rem] text-muted">VOL</span>
            <input type="range" min={0} max={1.5} step={0.01} value={onAir.volume} onChange={(e) => onAir.setVolume(Number(e.target.value))} className="radio-range flex-1" aria-label="Volumen del audio de YouTube" style={{ ["--v" as string]: `${(onAir.volume / 1.5) * 100}%` }} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-[0.8rem]">
            <input type="checkbox" checked={follow} onChange={(e) => onFollow(e.target.checked)} />
            Al terminar el video, seguir con la cola
          </label>
          <button type="button" className="btn mt-3 !py-1.5" onClick={onAir.stop}>
            Quitar del aire
          </button>
        </div>
      ) : videoId ? (
        <ol className="mt-3 grid gap-2.5 text-[0.84rem]">
          <li className="flex flex-wrap items-center gap-2">
            <span className="mono text-accent-ink">1</span>
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer" className="btn !px-3 !py-1">
              Abrir el video en YouTube ↗
            </a>
            <span className="text-muted">Se abre en otra pestaña. Pulsa play ahí cuando quieras.</span>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="mono text-accent-ink">2</span>
            <button type="button" className="btn btn-accent !px-3 !py-1" onClick={() => void share()} disabled={busy}>
              {busy ? "Esperando al navegador…" : "Sacar su audio al aire"}
            </button>
            <span className="text-muted">Elige la pestaña de YouTube y marca «Compartir audio de la pestaña».</span>
          </li>
        </ol>
      ) : (
        <p className="studio-empty !mt-3 !py-3">Pega un enlace y pulsa Cargar.</p>
      )}
      {!onAir.on && videoId && (
        <p className="mono muted mt-2 text-[0.62rem]">Solo en Chrome o Edge. La pestaña de YouTube queda en silencio para ti: la oyes por la salida del estudio.</p>
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
                <button type="button" className="btn !px-2.5 !py-0.5 !text-[0.66rem]" onClick={() => choose(r.id)} aria-label={`Volver a cargar el video ${r.id}`}>
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
