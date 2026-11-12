import { getDb } from "@/lib/db";
import type { Actor } from "@/lib/rbac";
import { getRecentTracks, type RecentTrack } from "@/modules/radio/nowplaying";
import { getNowPlaying, type NowPlaying } from "@/modules/schedule/public";

const hhmm = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota", hour12: false }) : "";

function ProgramCard({ now }: { now: NowPlaying | null }) {
  return (
    <div className="panel p-5">
      <p className="mono text-muted">Programa al aire</p>
      {now ? (
        <div className="mt-3 flex items-start gap-4">
          <span className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-line" style={{ background: `linear-gradient(135deg, ${now.program.color}, #0c0c0c)` }}>
            {now.program.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagen propia del programa servida por /media
              <img src={now.program.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span className="display-up text-[2rem] text-black">{now.program.name.slice(0, 1)}</span>
            )}
          </span>
          <div className="min-w-0">
            <p className="mono flex items-center gap-2 text-accent-ink">
              <span className="inline-block size-2 rounded-full bg-accent" aria-hidden="true" /> Al aire · {hhmm(now.startsAt)}–{hhmm(now.endsAt)}
            </p>
            <h3 className="display-up mt-1 text-[1.6rem] leading-none">{now.program.name}</h3>
            {now.program.hosts && <p className="mono mt-1 text-muted">Con {now.program.hosts}</p>}
            {now.program.description && <p className="mt-2 text-[0.9rem] text-muted">{now.program.description}</p>}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-muted">No hay un programa programado en este momento.</p>
      )}
      {now?.next && (
        <p className="mono mt-4 border-t border-line pt-3 text-muted">
          Sigue: <span className="text-fg">{now.next.program.name}</span> a las {hhmm(now.next.startsAt)}
        </p>
      )}
    </div>
  );
}

function TrackRow({ t, rank }: { t: RecentTrack; rank: number }) {
  return (
    <li className="flex items-center gap-3 py-2.5" data-onair={t.onAir}>
      <span className={`display-cond w-8 shrink-0 text-center text-[1.5rem] ${t.onAir ? "text-accent-ink" : "text-muted"}`}>{rank}</span>
      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-panel-2">
        {t.art ? (
          // eslint-disable-next-line @next/next/no-img-element -- carátula pública de AzuraCast (https)
          <img src={t.art} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="mono text-muted">♪</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold leading-tight">{t.title}</span>
        <span className="mono block truncate text-muted">{t.artist || "—"}</span>
      </span>
      {t.onAir ? <span className="badge badge-ok">Al aire</span> : <time className="mono shrink-0 text-muted">{hhmm(t.playedAt)}</time>}
    </li>
  );
}

/** Dashboard: programa al aire y las últimas 10 canciones (la que suena va primero). */
export async function OnAirPanel({ actor }: { actor: Actor }) {
  const db = await getDb();
  const [now, tracks] = await Promise.all([getNowPlaying(db).catch(() => null), getRecentTracks(db, actor, 10).catch(() => [] as RecentTrack[])]);
  return (
    <section className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-label="En el aire">
      <ProgramCard now={now} />
      <div className="panel p-5">
        <p className="mono text-muted">Últimas canciones · top 10</p>
        {tracks.length === 0 ? (
          <p className="mt-3 text-muted">No se pudo leer el historial de la radio en este momento.</p>
        ) : (
          <ol className="mt-2 divide-y divide-line">
            {tracks.map((t, i) => (
              <TrackRow key={`${t.playedAt}-${i}`} t={t} rank={i + 1} />
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
