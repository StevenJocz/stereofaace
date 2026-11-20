"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SpotifyNow } from "@/modules/studio/spotify-now";
import { SPOTIFY_CALLBACK_PATH, type SpotifyLink } from "./useSpotifyNow";

export type SpotifyOnAir = {
  /** El audio de Spotify está entrando a la emisión. */
  on: boolean;
  /** Pide al navegador compartir la pestaña (con su audio) y lo mezcla en la emisión. Lanza un Error con el motivo si no se pudo. */
  share: () => Promise<void>;
  stop: () => void;
  volume: number;
  setVolume: (v: number) => void;
};

const noopSubscribe = () => () => {};
const origin = () => window.location.origin;

/** «Título — Artista» de lo que suena en Spotify. */
function NowPlaying({ now, conn }: { now: SpotifyNow | null; conn: SpotifyLink["conn"] }) {
  if (conn !== "connected") return null;
  const t = now?.track;
  return (
    <p className="mono mt-2 flex flex-wrap items-baseline gap-x-2 text-[0.72rem]" aria-live="polite">
      <span className="text-muted">SUENA EN SPOTIFY</span>
      {now?.ad ? (
        <span className="text-[#ffd23f]">Anuncio de Spotify</span>
      ) : t ? (
        <>
          <strong className="text-[0.84rem] font-semibold normal-case tracking-normal text-[color:var(--fg)]">{t.artist ? `${t.title} — ${t.artist}` : t.title}</strong>
          {!now?.playing && <span className="text-muted">en pausa</span>}
        </>
      ) : (
        <span className="text-muted">nada por ahora</span>
      )}
    </p>
  );
}

/**
 * Spotify en el estudio, para pedidos. Spotify NO suena aquí: el locutor lo abre en su propia pestaña de Spotify, comparte esa
 * pestaña (con su audio) y el estudio lo mezcla en la emisión; el navegador silencia esa pestaña para que no se duplique el sonido.
 * El audio entra como una pista más: pasa por el EQ, baja cuando el locutor habla y tiene su propio volumen.
 * El nombre de la canción lo da la API de Spotify (cuenta conectada una vez); sin conexión, el audio sale igual pero sin nombre.
 * Los anuncios los decide Spotify (sin anuncios con Premium); la música de Spotify no tiene licencia de radio.
 */
export function SpotifyPanel({ seed, onAir, follow, onFollow, spotify }: { seed?: { text: string; n: number } | null; onAir: SpotifyOnAir; follow: boolean; onFollow: (v: boolean) => void; spotify: SpotifyLink }) {
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const host = useSyncExternalStore(noopSubscribe, origin, () => "");

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
  const shownError = error ?? spotify.error;
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
          <NowPlaying now={spotify.now} conn={spotify.conn} />
          <label className="mt-2 flex items-center gap-3 text-[0.8rem]">
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
          <NowPlaying now={spotify.now} conn={spotify.conn} />
          <p className="mono muted mt-2 text-[0.62rem]">Solo en Chrome o Edge. La pestaña de Spotify queda en silencio para ti: la oyes por la salida del estudio.</p>
        </>
      )}

      {shownError && (
        <p role="alert" className="mono mt-2 text-[0.7rem] text-[#ff8a8a]">
          {shownError}
        </p>
      )}

      {/* Conexión con la cuenta: solo sirve para leer el nombre de la canción que suena. */}
      <div className="mt-3 border-t border-line pt-3">
        {spotify.conn === "unconfigured" && (
          <p className="mono muted text-[0.62rem]">
            Para ver aquí el nombre real de la canción, quien administra debe poner <code>SPOTIFY_CLIENT_ID</code> en el servidor (ver DEPLOY.md). Mientras tanto el audio sale igual, sin nombre.
          </p>
        )}
        {spotify.conn === "disconnected" && (
          <>
            <button type="button" className="btn !px-3 !py-1" onClick={spotify.connect}>
              Conectar Spotify para ver el nombre ↗
            </button>
            <p className="mono muted mt-1 text-[0.62rem]">Solo permite ver qué canción suena; no controla ni cambia nada. Se hace una vez.</p>
          </>
        )}
        {spotify.conn === "connecting" && (
          <p className="mono flex flex-wrap items-center gap-2 text-[0.7rem] text-muted" role="status">
            Esperando a Spotify en la ventana emergente…
            <button type="button" className="btn !px-2.5 !py-0.5 !text-[0.66rem]" onClick={spotify.cancel}>
              Cancelar
            </button>
          </p>
        )}
        {spotify.conn === "connected" && (
          <p className="mono flex flex-wrap items-center gap-2 text-[0.66rem] text-muted">
            Spotify conectado.
            <button type="button" className="underline" onClick={spotify.disconnect}>
              Desconectar
            </button>
          </p>
        )}
        {spotify.conn !== "unconfigured" && host && (
          <p className="mono muted mt-1 text-[0.58rem]">
            URI de redirección en Spotify for Developers: <code>{host}{SPOTIFY_CALLBACK_PATH}</code>
          </p>
        )}
      </div>

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
