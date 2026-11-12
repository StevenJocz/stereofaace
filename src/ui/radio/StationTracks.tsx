import type { StationTracks } from "./useStationTracks";

const line = (t: { title: string; artist: string }) => (t.artist ? `${t.title} — ${t.artist}` : t.title);

/** Lo que suena ahora (con carátula) y, en una sola línea discreta, las dos anteriores. */
export function TrackList({ tracks }: { tracks: StationTracks }) {
  const now = tracks.nowPlaying;
  if (!now) return null;
  return (
    <div className="np-card" aria-label="Canciones de la emisora">
      <span className="np-cover" aria-hidden="true">
        {now.art ? (
          // eslint-disable-next-line @next/next/no-img-element -- carátula pública de AzuraCast (https)
          <img src={now.art} alt="" className="absolute inset-0 size-full object-cover" />
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
        {tracks.history.length > 0 && (
          <p className="mono mt-1 truncate text-[0.62rem] text-muted/70" title={tracks.history.map(line).join(" · ")}>
            Antes · {tracks.history.map((t) => t.title).join("  ·  ")}
          </p>
        )}
      </div>
    </div>
  );
}
