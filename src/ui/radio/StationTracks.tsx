import type { StationTracks } from "./useStationTracks";

const line = (t: { title: string; artist: string }) => (t.artist ? `${t.title} — ${t.artist}` : t.title);

/** Lo que suena ahora (con carátula) y, en una sola línea discreta, las dos anteriores. */
/** Carátula que AzuraCast pone cuando la canción no trae una (el icono azul de nota musical). */
export const isGenericArt = (url: string | null) => !url || /generic_song/i.test(url);

/** Las anteriores sin repetir la que suena ni la misma canción dos veces seguidas. */
export function previousTitles(now: { title: string }, history: { title: string }[]): string[] {
  const out: string[] = [];
  for (const h of history) {
    const t = h.title.trim();
    if (!t || t.toLowerCase() === now.title.trim().toLowerCase() || out.at(-1)?.toLowerCase() === t.toLowerCase()) continue;
    out.push(t);
  }
  return out;
}

export function TrackList({ tracks, fallbackArt = null }: { tracks: StationTracks; fallbackArt?: string | null }) {
  const now = tracks.nowPlaying;
  if (!now) return null;
  const art = isGenericArt(now.art) ? fallbackArt : now.art;
  const before = previousTitles(now, tracks.history);
  return (
    <div className="np-card" aria-label="Canciones de la emisora">
      <span className="np-cover" aria-hidden="true">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element -- carátula pública de AzuraCast (https)
          <img src={art} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="mono text-muted">♪</span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="mono flex items-center gap-1.5 text-[0.6rem] text-accent-ink">
          <span aria-hidden="true" className="np-bars">
            <i />
            <i />
            <i />
          </span>
          Suena ahora
        </p>
        <p className="truncate text-[1.02rem] font-bold leading-tight" title={line(now)}>
          {now.title}
        </p>
        <p className="mono truncate text-[0.7rem] text-muted">{now.artist || "—"}</p>
        {before.length > 0 && (
          <p className="mono mt-1 truncate text-[0.62rem] text-muted/70" title={before.join(" · ")}>
            Antes · {before.join("  ·  ")}
          </p>
        )}
      </div>
    </div>
  );
}
