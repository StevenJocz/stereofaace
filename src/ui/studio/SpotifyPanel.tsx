"use client";

import { useEffect, useState } from "react";
import type { StudioProgram } from "@/modules/schedule/dj";

export type SpotifyOnAir = {
  /** El audio de Spotify está entrando a la emisión. */
  on: boolean;
  /** Pide al navegador compartir la pestaña (con su audio) y lo mezcla en la emisión. Lanza un Error con el motivo si no se pudo. */
  share: () => Promise<void>;
  stop: () => void;
  volume: number;
  setVolume: (v: number) => void;
};

/** Lo que verá quien escucha mientras Spotify está al aire: el programa, con su imagen. */
function ProgramCard({ program, label }: { program: StudioProgram | null; label: string }) {
  return (
    <div className="mt-2 flex items-center gap-3">
      <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-black" aria-hidden="true">
        {program?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
          <img src={program.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="display-up text-[1.1rem] text-accent-ink">{(program?.name ?? "S").slice(0, 1)}</span>
        )}
      </span>
      <p className="min-w-0">
        <span className="mono block text-[0.62rem] text-muted">{label}</span>
        <strong className="block truncate text-[0.92rem]">{program?.name ?? "En vivo"}</strong>
        {program?.hosts && <span className="block truncate text-[0.74rem] text-muted">Con {program.hosts}</span>}
      </p>
    </div>
  );
}

/**
 * Spotify en el estudio, para pedidos. Spotify NO suena aquí: el locutor lo abre en su propia pestaña de Spotify, comparte esa
 * pestaña (con su audio) y el estudio lo mezcla en la emisión; el navegador silencia esa pestaña para que no se duplique el sonido.
 * El audio entra como una pista más: pasa por el EQ, baja cuando el locutor habla y tiene su propio volumen.
 * Si suena Spotify es porque hay un programa en vivo: quien escucha ve el nombre y la imagen del programa, no el de una canción.
 * Los anuncios los decide Spotify (sin anuncios con Premium); la música de Spotify no tiene licencia de radio.
 */
export function SpotifyPanel({ seed, onAir, follow, onFollow, program }: { seed?: { text: string; n: number } | null; onAir: SpotifyOnAir; follow: boolean; onFollow: (v: boolean) => void; program: StudioProgram | null }) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seed?.text) setSearch(seed.text); // eslint-disable-line react-hooks/set-state-in-effect -- precarga la búsqueda desde un pedido
  }, [seed]);

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
    <section className="studio-voice panel" aria-label="Spotify">
      <h2 className="display-up text-[1.15rem]">Spotify al aire</h2>
      <p className="mono muted mt-1 text-[0.66rem]">El audio de Spotify sale por la transmisión. Aquí no suena: así no se duplica el sonido.</p>

      {onAir.on ? (
        <div className="mt-3 rounded-[10px] border border-accent p-3" role="status">
          <p className="mono flex items-center gap-2 text-[0.7rem] text-accent-ink">
            <span aria-hidden="true" className="inline-block size-2 rounded-full bg-accent live-dot" />
            AL AIRE · audio de Spotify
          </p>
          <ProgramCard program={program} label="AL AIRE COMO" />
          <label className="mt-3 flex items-center gap-3 text-[0.8rem]">
            <span className="mono text-[0.66rem] text-muted">VOL</span>
            <input type="range" min={0} max={1.5} step={0.01} value={onAir.volume} onChange={(e) => onAir.setVolume(Number(e.target.value))} className="radio-range flex-1" aria-label="Volumen del audio de Spotify" style={{ ["--v" as string]: `${(onAir.volume / 1.5) * 100}%` }} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-[0.8rem]">
            <input type="checkbox" checked={follow} onChange={(e) => onFollow(e.target.checked)} />
            Al terminar, seguir con la cola
          </label>
          <button type="button" className="btn mt-3 !py-1.5" onClick={onAir.stop}>
            Quitar del aire
          </button>
        </div>
      ) : (
        <>
          <ol className="mt-3 grid gap-2.5 text-[0.84rem]">
            <li className="flex flex-wrap items-center gap-2">
              <span className="mono text-accent-ink">1</span>
              <a href="https://open.spotify.com/" target="_blank" rel="noopener noreferrer" className="btn !px-3 !py-1">
                Abrir Spotify ↗
              </a>
              <span className="text-muted">Se abre en otra pestaña. Pon ahí lo que quieras y pulsa play.</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className="mono text-accent-ink">2</span>
              <button type="button" className="btn btn-accent !px-3 !py-1" onClick={() => void share()} disabled={busy}>
                {busy ? "Esperando al navegador…" : "Sacar su audio al aire"}
              </button>
              <span className="text-muted">Elige la pestaña de Spotify y marca «Compartir audio de la pestaña».</span>
            </li>
          </ol>
          <ProgramCard program={program} label="QUIEN ESCUCHA VERÁ" />
          <p className="mono muted mt-2 text-[0.62rem]">Solo en Chrome o Edge. La pestaña de Spotify queda en silencio para ti: la oyes por la salida del estudio.</p>
        </>
      )}

      {error && (
        <p role="alert" className="mono mt-2 text-[0.7rem] text-[#ff8a8a]">
          {error}
        </p>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <p className="mono text-[0.66rem] text-accent-ink">Buscar un pedido en Spotify</p>
        <form
          className="mt-1.5 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q) window.open(`https://open.spotify.com/search/${encodeURIComponent(q)}`, "_blank", "noopener,noreferrer");
          }}
        >
          <input className="input !py-2 min-w-[12rem] flex-1" placeholder="Título y artista" aria-label="Qué buscar en Spotify" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={140} />
          <button type="submit" className="btn !py-2" disabled={!q}>
            Buscar ↗
          </button>
        </form>
        <p className="mono muted mt-1 text-[0.62rem]">Se abre Spotify en otra pestaña con la búsqueda lista.</p>
      </div>
    </section>
  );
}
