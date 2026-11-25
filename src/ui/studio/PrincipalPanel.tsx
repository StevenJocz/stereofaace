"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DeckView } from "./DeckPanel";
import { PollVu, useClock, ZaraWindow } from "./ZaraWindow";
import type { DeckId } from "./engine/audio-engine";
import { DRAG_TYPE, azToQueueItem, parseDragItems } from "./engine/library";
import type { QueueItem } from "./engine/queue";
import { endsAtMs, formatClock, formatRemaining, sumDurations } from "./zara-format";

const label = (i: QueueItem) => (i.artist ? `${i.artist} - ${i.title}` : i.title);
const dur = (s: number | null | undefined) => (s && Number.isFinite(s) ? formatRemaining(s).replace(/\.\d$/, "") : "--:--");

const noteIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </svg>
);

function QueueRow({ item, selected, onSelect, onPlayNow, onRemove }: { item: QueueItem; selected: boolean; onSelect: () => void; onPlayNow: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="zs-row zs-qrow"
      data-state="queue"
      data-selected={selected || undefined}
      data-dragging={isDragging || undefined}
      onClick={onSelect}
      onDoubleClick={onPlayNow}
      title="Doble clic: reproducir ahora · arrastra para reordenar"
      {...attributes}
      {...listeners}
      role="listitem"
    >
      <span className="zs-ico">{noteIcon}</span>
      <span className="zs-row-text">{label(item)}</span>
      <span className="zs-row-dur">{dur(item.durationSec)}</span>
      <button
        type="button"
        className="zs-row-x"
        aria-label={`Quitar ${item.title} de la lista`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ✕
      </button>
    </li>
  );
}

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/**
 * «Principal»: la lista de reproducción como en ZaraStudio. Arriba el contador de la pista que suena (tiempo restante, medidores L/R,
 * hora de fin), la duración de la lista y la barra de la pista (clic = saltar a ese punto); en medio la lista (rojo = al aire,
 * verde = la siguiente, ya cargada); abajo los botones de transporte. Los dos decks A/B siguen debajo: aquí se ve el que está al aire.
 */
export function PrincipalPanel({
  decks,
  active,
  queue,
  rejected,
  auto,
  onAuto,
  readLR,
  volume,
  onVolume,
  onPlay,
  onPause,
  onStop,
  onFade,
  onCut,
  onRestart,
  onSeek,
  onPlayNow,
  onAddFiles,
  onAddItems,
  onMove,
  onRemove,
  onClear,
}: {
  decks: Record<DeckId, DeckView>;
  active: DeckId;
  queue: QueueItem[];
  rejected: string[];
  auto: boolean;
  onAuto: (v: boolean) => void;
  readLR: (id: DeckId, ch: 0 | 1) => number;
  volume: number;
  onVolume: (v: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onFade: () => void;
  onCut: () => void;
  onRestart: () => void;
  onSeek: (sec: number) => void;
  onPlayNow: (item: QueueItem) => void;
  onAddFiles: (files: File[]) => void;
  onAddItems: (items: QueueItem[]) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const now = useClock(1000);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const cur = decks[active];
  const nextDeck = decks[active === "A" ? "B" : "A"];
  const playing = cur.playing;
  const total = cur.durationSec ?? 0;
  const remaining = cur.item && total > 0 ? Math.max(0, total - cur.currentSec) : null;
  const progress = cur.item && total > 0 ? Math.min(100, (cur.currentSec / total) * 100) : 0;
  // El deck contrario puede tener ya cargada (y sin sonar) la pista que sigue.
  const preloaded = nextDeck.item && !nextDeck.playing && !nextDeck.spent ? nextDeck : null;

  const listTotal = sumDurations([cur.item ? total : null, preloaded?.durationSec, ...queue.map((q) => q.durationSec)]);
  const listLeft = sumDurations([remaining, preloaded?.durationSec, ...queue.map((q) => q.durationSec)]);
  const endsAt = playing ? endsAtMs(now, remaining) : null;

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const lib = parseDragItems(e.dataTransfer.getData(DRAG_TYPE));
    if (lib.length) return onAddItems(lib.map(azToQueueItem));
    if (e.dataTransfer.files.length) onAddFiles(Array.from(e.dataTransfer.files));
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = queue.findIndex((i) => i.id === e.active.id);
    const to = queue.findIndex((i) => i.id === e.over!.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };
  const selectedItem = queue.find((q) => q.id === selected) ?? null;

  return (
    <ZaraWindow
      title={`Principal${cur.item ? "" : " - lista"}`}
      tone="red"
      className="zs-main"
      actions={
        <span className="zs-win-note" aria-live="polite">
          Deck {active} al aire
        </span>
      }
    >
      <div className="zs-iconbar">
        <button type="button" className="zs-iconbtn" onClick={() => input.current?.click()} aria-label="Añadir archivos de audio" title="Añadir archivos">
          <Svg>
            <path d="M12 5v14M5 12h14" />
          </Svg>
        </button>
        <button type="button" className="zs-iconbtn" onClick={() => selectedItem && onRemove(selectedItem.id)} disabled={!selectedItem} aria-label="Quitar la pista seleccionada" title="Quitar la seleccionada">
          <Svg>
            <path d="M6 6l12 12M18 6L6 18" />
          </Svg>
        </button>
        <button type="button" className="zs-iconbtn" onClick={onClear} disabled={queue.length === 0} aria-label="Vaciar la lista" title="Vaciar la lista">
          <Svg>
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </Svg>
        </button>
        <span className="zs-spacer" />
        <label className="zs-select">
          <span className="sr-only">Al terminar una pista</span>
          <select value={auto ? "auto" : "manual"} onChange={(e) => onAuto(e.target.value === "auto")}>
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          multiple
          hidden
          onChange={(e) => {
            onAddFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <div className="zs-counter">
        <div className="zs-counter-cell">
          <span className="zs-label">Tiempo restante</span>
          <div className="zs-counter-line">
            <strong className="zs-big" data-dim={cur.item ? undefined : true}>
              {formatRemaining(remaining ?? 0)}
            </strong>
            <div className="zs-lr" aria-hidden={false}>
              <span>L</span>
              <PollVu read={() => readLR(active, 0)} label="Nivel izquierdo" />
              <span>R</span>
              <PollVu read={() => readLR(active, 1)} label="Nivel derecho" />
            </div>
          </div>
        </div>
        <div className="zs-counter-cell zs-counter-end">
          <span className="zs-label">Acaba a las:</span>
          <strong className="zs-mid">{endsAt ? formatClock(endsAt) : "--:--:--"}</strong>
        </div>
      </div>
      <p className="zs-meta">
        <span>
          Duración lista: <b>{formatRemaining(listTotal)}</b>
        </span>
        <span>
          Restante lista: <b>{formatRemaining(listLeft)}</b>
        </span>
      </p>
      <button
        type="button"
        className="zs-progress"
        data-playing={playing || undefined}
        disabled={!cur.item || total <= 0}
        aria-label={cur.item ? `Pista al aire: ${label(cur.item)}. Clic para saltar a un punto` : "No hay pista cargada"}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * total);
        }}
      >
        <i style={{ width: `${progress}%` }} />
        <span>{cur.item ? label(cur.item) : "Lista vacía: añade pistas desde el explorador"}</span>
      </button>

      {rejected.length > 0 && (
        <p role="status" className="zs-note">
          No son audio y se ignoraron: {rejected.join(", ")}
        </p>
      )}

      <div
        className="zs-listwrap"
        data-over={over || undefined}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <div className="zs-listhead" aria-hidden="true">
          <span>Descripción</span>
          <span>Duración</span>
        </div>
        <ul className="zs-list" aria-label="Lista de reproducción">
          {cur.item && (
            <li className="zs-row" data-state="now" data-playing={playing || undefined} aria-current="true">
              <span className="zs-ico">{noteIcon}</span>
              <span className="zs-row-text">{label(cur.item)}</span>
              <span className="zs-row-dur">{dur(total)}</span>
            </li>
          )}
          {preloaded?.item && (
            <li className="zs-row" data-state="next">
              <span className="zs-ico">{noteIcon}</span>
              <span className="zs-row-text">{label(preloaded.item)}</span>
              <span className="zs-row-dur">{dur(preloaded.durationSec)}</span>
            </li>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={queue.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {queue.map((item) => (
                <QueueRow key={item.id} item={item} selected={selected === item.id} onSelect={() => setSelected(item.id)} onPlayNow={() => onPlayNow(item)} onRemove={() => onRemove(item.id)} />
              ))}
            </SortableContext>
          </DndContext>
          {!cur.item && !preloaded && queue.length === 0 && <li className="zs-empty">Suelta aquí canciones de tu computador o arrástralas desde el explorador.</li>}
        </ul>
      </div>

      <div className="zs-transport">
        <div className="zs-btns">
          <button type="button" className="zs-tb" data-kind="play" onClick={() => (selectedItem && !playing ? onPlayNow(selectedItem) : onPlay())} aria-label={selectedItem && !playing ? "Reproducir la pista seleccionada" : "Reproducir"} title="Reproducir (la seleccionada, o la siguiente)">
            <Svg>
              <path d="M7 5v14l12-7z" fill="currentColor" />
            </Svg>
          </button>
          <button type="button" className="zs-tb" data-kind="stop" onClick={onStop} disabled={!cur.item} aria-label="Detener y volver al principio" title="Detener">
            <Svg>
              <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
            </Svg>
          </button>
          <button type="button" className="zs-tb" data-kind="pause" onClick={onPause} disabled={!playing} aria-label="Pausa" title="Pausa">
            <Svg>
              <path d="M8 5v14M16 5v14" strokeWidth="3.2" />
            </Svg>
          </button>
          <button type="button" className="zs-tb" data-kind="fade" onClick={onFade} aria-label="Pasar a la siguiente con fundido" title="Siguiente con fundido">
            <Svg>
              <path d="M3 7c6 0 7 10 13 10M3 17c6 0 7-10 13-10M18 8l3 4-3 4" />
            </Svg>
          </button>
          <button type="button" className="zs-tb" data-kind="restart" onClick={onRestart} disabled={!cur.item} aria-label="Reiniciar la pista" title="Volver al principio de la pista">
            <Svg>
              <path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor" />
            </Svg>
          </button>
          <button type="button" className="zs-tb" data-kind="skip" onClick={onCut} aria-label="Pasar a la siguiente en seco" title="Siguiente en seco">
            <Svg>
              <path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor" />
            </Svg>
          </button>
        </div>
        <label className="zs-fader">
          <span className="sr-only">Volumen de los decks</span>
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(e) => onVolume(Number(e.target.value))} aria-label="Volumen de los decks" />
        </label>
      </div>
    </ZaraWindow>
  );
}
