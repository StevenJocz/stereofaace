"use client";

import { useRef, useState, type DragEvent } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatTime } from "./MeterBar";
import type { DeckId } from "./engine/audio-engine";
import { DRAG_TYPE, azToQueueItem, parseDragItems } from "./engine/library";
import type { QueueItem } from "./engine/queue";

function Row({
  item,
  onLoad,
  onRemove,
}: {
  item: QueueItem;
  onLoad: (id: DeckId) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="studio-row"
      data-dragging={isDragging}
    >
      <button type="button" className="studio-handle" aria-label={`Mover ${item.title}`} {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{item.title}</span>
        <span className="mono muted block truncate">
          {item.artist || "—"} · {item.durationSec ? formatTime(item.durationSec) : "--:--"}
        </span>
      </span>
      <button type="button" className="btn !px-3 !py-1" onClick={() => onLoad("A")} aria-label={`Cargar ${item.title} en el deck A`}>
        A
      </button>
      <button type="button" className="btn !px-3 !py-1" onClick={() => onLoad("B")} aria-label={`Cargar ${item.title} en el deck B`}>
        B
      </button>
      <button type="button" className="btn !px-3 !py-1" onClick={onRemove} aria-label={`Quitar ${item.title} de la cola`}>
        ✕
      </button>
    </li>
  );
}

export function QueuePanel({
  queue,
  rejected,
  auto,
  onAuto,
  onAddFiles,
  onAddItems,
  onMove,
  onRemove,
  onClear,
  onLoad,
}: {
  queue: QueueItem[];
  rejected: string[];
  auto: boolean;
  onAuto: (v: boolean) => void;
  onAddFiles: (files: File[]) => void;
  onAddItems: (items: QueueItem[]) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onLoad: (item: QueueItem, deck: DeckId) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const lib = parseDragItems(e.dataTransfer.getData(DRAG_TYPE));
    if (lib.length) {
      onAddItems(lib.map(azToQueueItem));
      return;
    }
    if (e.dataTransfer.files.length) onAddFiles(Array.from(e.dataTransfer.files));
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = queue.findIndex((i) => i.id === e.active.id);
    const to = queue.findIndex((i) => i.id === e.over!.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <section
      className="studio-queue panel"
      data-over={over}
      aria-label="Cola de reproducción"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display-up text-[1.4rem]">Cola ({queue.length})</h2>
        <div className="flex items-center gap-2">
          <label className="mono muted flex items-center gap-2">
            <input type="checkbox" checked={auto} onChange={(e) => onAuto(e.target.checked)} /> Siguiente automática
          </label>
          <button type="button" className="btn !px-3 !py-1" onClick={() => input.current?.click()}>
            Añadir archivos
          </button>
          <button type="button" className="btn !px-3 !py-1" onClick={onClear} disabled={!queue.length}>
            Vaciar
          </button>
        </div>
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
      </header>
      {rejected.length > 0 && (
        <p role="status" className="mono mt-2 text-[var(--violet)]">
          No son audio y se ignoraron: {rejected.join(", ")}
        </p>
      )}
      {queue.length === 0 ? (
        <p className="studio-empty">Suelta aquí canciones de tu computador, o súmalas desde la biblioteca.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={queue.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ul className="mt-3 grid gap-2">
              {queue.map((item) => (
                <Row key={item.id} item={item} onLoad={(d) => onLoad(item, d)} onRemove={() => onRemove(item.id)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
