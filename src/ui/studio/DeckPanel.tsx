"use client";

import { MeterBar, formatTime } from "./MeterBar";
import { VinylDisc } from "./VinylDisc";
import type { DeckId } from "./engine/audio-engine";
import type { QueueItem } from "./engine/queue";

export type DeckView = {
  item: QueueItem | null;
  durationSec: number | null;
  currentSec: number;
  playing: boolean;
  levelDb: number;
  volume: number;
};

const ACCENT: Record<DeckId, string> = { A: "#c6ff00", B: "#9b6bff" };

export function DeckPanel({
  id,
  deck,
  active,
  onPlay,
  onPause,
  onSeek,
  onVolume,
}: {
  id: DeckId;
  deck: DeckView;
  active: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (sec: number) => void;
  onVolume: (v: number) => void;
}) {
  const dur = deck.durationSec ?? 0;
  const remaining = dur > 0 ? dur - deck.currentSec : NaN;
  return (
    <section className="studio-deck panel" data-active={active} aria-label={`Deck ${id}`}>
      <div className="studio-deck-body">
        <VinylDisc playing={deck.playing} deck={id} accent={ACCENT[id]} />
        <div className="studio-deck-info">
          <header className="flex items-center justify-between gap-2">
            <span className="display-up text-[1.15rem]">Deck {id}</span>
            {active && deck.playing && <span className="badge badge-ok">Al aire</span>}
          </header>
          <p className="mt-1 min-h-[2.4rem]">
            <span className="block truncate text-[1rem] font-bold">{deck.item?.title ?? "Vacío"}</span>
            <span className="mono muted block truncate">{deck.item?.artist || (deck.item ? "—" : "Arrastra una canción a la cola")}</span>
          </p>
          <input
            type="range"
            aria-label={`Posición del deck ${id}`}
            className="studio-range mt-2 w-full"
            min={0}
            max={dur || 1}
            step={0.1}
            value={Math.min(deck.currentSec, dur || 1)}
            disabled={!deck.item || !dur}
            onChange={(e) => onSeek(Number(e.target.value))}
          />
          <p className="mono muted flex justify-between">
            <span>{formatTime(deck.currentSec)}</span>
            <span>−{formatTime(remaining)}</span>
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="btn btn-accent !px-4 !py-2"
              disabled={!deck.item}
              onClick={deck.playing ? onPause : onPlay}
              aria-label={deck.playing ? `Pausar deck ${id}` : `Reproducir deck ${id}`}
            >
              {deck.playing ? "Pausa" : "Play"}
            </button>
            <label className="mono muted flex flex-1 items-center gap-2">
              Vol
              <input
                type="range"
                aria-label={`Volumen del deck ${id}`}
                className="studio-range flex-1"
                min={0}
                max={1}
                step={0.01}
                value={deck.volume}
                onChange={(e) => onVolume(Number(e.target.value))}
              />
            </label>
          </div>
          <MeterBar db={deck.levelDb} label={`Nivel del deck ${id}`} className="mt-2" />
        </div>
      </div>
    </section>
  );
}
