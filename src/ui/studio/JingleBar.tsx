"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartKind, CartView } from "@/modules/studio/carts";
import { CART_KIND_LABEL, groupByKind } from "./engine/carts";
import { PollMeter } from "./PollMeter";
import { formatRemaining } from "./zara-format";

const SLOTS = 9;

/** Micrófono del locutor, siempre a mano junto a los jingles. */
export type MicControl = {
  active: boolean;
  muted: boolean;
  error: string | null;
  readLevel: () => number;
  /** Tecla para hablar mientras se mantiene (p. ej. «V»). */
  pttLabel: string;
  /** Enciende el micrófono (pide permiso la primera vez) o lo apaga; con un solo botón. */
  onToggle: () => void;
  /** Abre los ajustes de voz (dispositivo, ganancia, puerta de ruido y ducking). */
  onSettings: () => void;
};

/** Tiempo que le queda al audio de la casilla; solo ella se vuelve a dibujar. */
function Remaining({ read }: { read: () => number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setV(read()), 100);
    return () => clearInterval(t);
  }, [read]);
  return <>{formatRemaining(v)}</>;
}

/**
 * Barra de jingles como la de ZaraStudio: nueve casillas numeradas que disparan un audio con un clic. El selector de la derecha
 * elige el grupo (jingles, promos, efectos…); con más de nueve audios en el grupo se pasa de página.
 */
export function JingleBar({
  carts,
  state,
  playing,
  onFire,
  onStopAll,
  readRemaining,
  mic,
}: {
  carts: CartView[];
  state: "loading" | "ready" | "error";
  playing: ReadonlySet<string>;
  onFire: (c: CartView) => void;
  onStopAll: () => void;
  readRemaining: (id: string) => number;
  mic?: MicControl;
}) {
  const groups = groupByKind(carts);
  const kinds = (Object.keys(CART_KIND_LABEL) as CartKind[]).filter((k) => groups[k].length > 0);
  const [group, setGroup] = useState<CartKind | "all">("all");
  const [page, setPage] = useState(0);
  const list = group === "all" || groups[group].length === 0 ? [...carts].sort((a, b) => a.position - b.position) : groups[group];
  const pages = Math.max(1, Math.ceil(list.length / SLOTS));
  const p = Math.min(page, pages - 1);
  const slots = Array.from({ length: SLOTS }, (_, i) => list[p * SLOTS + i] ?? null);

  return (
    <div className="zs-jingles" role="group" aria-label="Casillas de jingles">
      <ol className="zs-slots">
        {slots.map((c, i) => {
          const on = c ? playing.has(c.id) : false;
          return (
            <li key={i}>
              <button
                type="button"
                className="zs-slot"
                data-empty={c ? undefined : true}
                data-playing={on || undefined}
                style={c ? { ["--cart" as string]: c.color } : undefined}
                disabled={!c}
                onClick={() => c && onFire(c)}
                aria-pressed={on}
                aria-label={c ? `${on ? "Detener" : "Reproducir"} ${c.name}, casilla ${i + 1}${c.hotkey ? `, atajo ${c.hotkey.toUpperCase()}` : ""}` : `Casilla ${i + 1} vacía`}
              >
                <b>{i + 1}</b>
                <span className="zs-slot-name">{c ? c.name : "Vacío"}</span>
                <span className="zs-slot-time">{c ? on ? <Remaining read={() => readRemaining(c.id)} /> : formatRemaining(c.durationSec) : "00:00.0"}</span>
                {c?.hotkey && <kbd>{c.hotkey.toUpperCase()}</kbd>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="zs-jingle-side">
        <div className="zs-jingle-row">
          <label className="zs-select">
            <span className="sr-only">Grupo de jingles</span>
            <select
              value={group}
              onChange={(e) => {
                setGroup(e.target.value as CartKind | "all");
                setPage(0);
              }}
            >
              <option value="all">Todos</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {CART_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="zs-iconbtn zs-stopall" onClick={onStopAll} disabled={playing.size === 0} title="Detener todos (Esc)" aria-label="Detener todos los jingles">
            ■
          </button>
        </div>
        <div className="zs-pager">
          <button type="button" className="zs-pagebtn" onClick={() => setPage(Math.max(0, p - 1))} disabled={p === 0} aria-label="Página anterior de jingles">
            ‹
          </button>
          <span aria-live="polite">
            {p + 1}/{pages}
          </span>
          <button type="button" className="zs-pagebtn" onClick={() => setPage(Math.min(pages - 1, p + 1))} disabled={p >= pages - 1} aria-label="Página siguiente de jingles">
            ›
          </button>
          {state === "ready" && carts.length === 0 && (
            <Link href="/admin/radio/studio/carts" className="zs-link" target="_blank" rel="noopener">
              Subir
            </Link>
          )}
          {state === "error" && (
            <span className="zs-link" role="alert">
              Error
            </span>
          )}
        </div>
      </div>
      {mic && (
        <div className="zs-mic" data-state={mic.active && !mic.muted ? "open" : "off"}>
          <div className="zs-mic-row">
            <button
              type="button"
              className="zs-mic-btn"
              onClick={mic.onToggle}
              aria-pressed={mic.active && !mic.muted}
              aria-label={mic.active && !mic.muted ? "Apagar el micrófono" : "Encender el micrófono"}
              title={mic.active && !mic.muted ? "Micrófono encendido: pulsa para apagarlo" : `Micrófono apagado: pulsa para encenderlo, o mantén la tecla ${mic.pttLabel} para hablar`}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4" />
                {!(mic.active && !mic.muted) && <path d="M4 4l16 16" />}
              </svg>
              <span>{mic.active && !mic.muted ? "Micrófono encendido" : "Micrófono apagado"}</span>
            </button>
            <button type="button" className="zs-iconbtn" onClick={mic.onSettings} title="Mezcla y ajustes del micrófono: dispositivo, ganancia, puerta de ruido, tecla para hablar y música de fondo" aria-label="Ajustes de voz">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 4v16M12 4v16M19 4v16M3 9h4M10 15h4M17 8h4" />
              </svg>
            </button>
          </div>
          {mic.active ? <PollMeter read={mic.readLevel} label="Nivel del micrófono" /> : null}
          <span className="zs-mic-hint">{mic.error ?? (mic.active && !mic.muted ? "Pulsa para apagar" : `Mantén ${mic.pttLabel} para hablar`)}</span>
        </div>
      )}
    </div>
  );
}
