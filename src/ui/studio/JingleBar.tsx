"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartKind, CartView } from "@/modules/studio/carts";
import { CART_KIND_LABEL, groupByKind } from "./engine/carts";
import { formatRemaining } from "./zara-format";

const SLOTS = 9;

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
}: {
  carts: CartView[];
  state: "loading" | "ready" | "error";
  playing: ReadonlySet<string>;
  onFire: (c: CartView) => void;
  onStopAll: () => void;
  readRemaining: (id: string) => number;
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
    </div>
  );
}
