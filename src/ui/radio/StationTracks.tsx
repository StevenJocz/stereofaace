import type { StationTracks } from "./useStationTracks";

const line = (t: { title: string; artist: string }) => (t.artist ? `${t.title} — ${t.artist}` : t.title);

/** Lo que suena ahora y las dos anteriores, para la barra de la emisora propia. */
export function TrackList({ tracks }: { tracks: StationTracks }) {
  if (!tracks.nowPlaying) return null;
  return (
    <div className="station-tracks min-w-0" aria-label="Canciones de la emisora">
      <p className="truncate font-bold leading-tight" title={line(tracks.nowPlaying)}>
        <span className="mono mr-2 text-[0.62rem] text-accent-ink">Suena</span>
        {line(tracks.nowPlaying)}
      </p>
      {tracks.history.map((t, i) => (
        <p key={`${t.playedAt}-${i}`} className="mono truncate text-[0.66rem] leading-snug text-muted" title={line(t)}>
          <span className="mr-2 opacity-70">Antes</span>
          {line(t)}
        </p>
      ))}
    </div>
  );
}
