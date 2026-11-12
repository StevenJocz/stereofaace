"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CartKind, CartView } from "@/modules/studio/carts";
import { PollValue } from "./PollMeter";
import { CART_KIND_LABEL, groupByKind } from "./engine/carts";

const fmtDur = (sec: number | null) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "–");

/** Barra de avance del audio que suena (se dibuja sola, sin re-renderizar la consola). */
function CartProgress({ read, total, inline = false }: { read: () => number; total: number | null; inline?: boolean }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let peak = total ?? 0;
    const t = setInterval(() => {
      const left = read();
      peak = Math.max(peak, left);
      setPct(peak > 0 ? Math.min(100, Math.max(0, (1 - left / peak) * 100)) : 0);
    }, 100);
    return () => clearInterval(t);
  }, [read, total]);
  return (
    <span className={inline ? "cart-progress cart-progress-inline" : "cart-progress"} aria-hidden="true">
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

export function CartWall({
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
  const [tab, setTab] = useState<CartKind | "all">("all");
  const nowCart = carts.find((c) => playing.has(c.id)) ?? null;
  const shown = tab === "all" || groups[tab].length === 0 ? [...carts].sort((a, b) => a.position - b.position) : groups[tab];

  return (
    <section className="studio-cartwall panel" aria-label="Cart Wall">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="display-up text-[1.15rem]">Cart Wall</h2>
        <div className="flex items-center gap-2">
          <button type="button" className="btn !px-3 !py-1" onClick={onStopAll} disabled={playing.size === 0} title="Detener todos (Esc)">
            Detener
          </button>
          <Link href="/admin/radio/studio/carts" className="btn !px-3 !py-1" target="_blank" rel="noopener">
            Gestionar
          </Link>
        </div>
      </header>
      <div className="cart-now" data-active={nowCart !== null}>
        {nowCart ? (
          <>
            <span className="cart-now-dot" style={{ background: nowCart.color }} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="mono text-[0.62rem] text-accent-ink">Sonando{playing.size > 1 ? ` · +${playing.size - 1}` : ""}</p>
              <p className="truncate font-bold leading-tight">{nowCart.name}</p>
              <CartProgress read={() => readRemaining(nowCart.id)} total={nowCart.durationSec} inline />
            </div>
            <span className="mono text-[0.78rem]">
              <PollValue read={() => readRemaining(nowCart.id)} format={(v) => `-${v.toFixed(1)} s`} intervalMs={100} />
            </span>
          </>
        ) : (
          <p className="mono muted text-[0.72rem]">Listo · pulsa un audio o su atajo. Esc detiene todo.</p>
        )}
      </div>
      {kinds.length > 1 && (
        <div role="tablist" aria-label="Tipo de audio" className="mt-2 flex flex-wrap gap-1.5">
          {(["all", ...kinds] as const).map((k) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              className={tab === k ? "btn btn-accent !px-2.5 !py-0.5" : "btn !px-2.5 !py-0.5"}
              onClick={() => setTab(k)}
            >
              {k === "all" ? "Todos" : CART_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      {state === "loading" && <p className="mono muted mt-3">Cargando audios…</p>}
      {state === "error" && (
        <p role="alert" className="mono mt-3 text-[var(--violet)]">
          No se pudieron cargar los audios del Cart Wall.
        </p>
      )}
      {state === "ready" && carts.length === 0 && (
        <p className="studio-empty !mt-3 !py-3">
          Aún no hay jingles ni promos.{" "}
          <Link href="/admin/radio/studio/carts" className="text-accent-ink underline" target="_blank" rel="noopener">
            Subir el primero
          </Link>
        </p>
      )}
      <ul className="cart-list studio-scroll mt-2">
        {shown.map((c) => {
          const on = playing.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className="cart-row"
                data-playing={on}
                style={{ ["--cart" as string]: c.color }}
                onClick={() => onFire(c)}
                aria-pressed={on}
                aria-label={`${on ? "Detener" : "Reproducir"} ${c.name}${c.hotkey ? `, atajo ${c.hotkey.toUpperCase()}` : ""}`}
              >
                <span className="cart-btn" aria-hidden="true">
                  {on ? (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="1.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5z" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="cart-name">{c.name}</span>
                  <span className="cart-kind mono">{CART_KIND_LABEL[c.kind]}</span>
                </span>
                <span className="cart-time mono">
                  {on ? <PollValue read={() => readRemaining(c.id)} format={(v) => `-${v.toFixed(1)} s`} intervalMs={100} /> : fmtDur(c.durationSec)}
                </span>
                {c.hotkey ? <kbd className="cart-key">{c.hotkey.toUpperCase()}</kbd> : <span className="cart-key-empty" />}
                {on && <CartProgress read={() => readRemaining(c.id)} total={c.durationSec} />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
