"use client";

import Link from "next/link";
import { useState } from "react";
import type { CartKind, CartView } from "@/modules/studio/carts";
import { PollValue } from "./PollMeter";
import { CART_KIND_LABEL, groupByKind } from "./engine/carts";

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
      <ul className="studio-cart-grid studio-scroll mt-2">
        {shown.map((c) => {
          const on = playing.has(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                className="studio-cart"
                data-playing={on}
                style={{ ["--cart" as string]: c.color }}
                onClick={() => onFire(c)}
                aria-pressed={on}
                aria-label={`${c.name}${c.hotkey ? `, atajo ${c.hotkey.toUpperCase()}` : ""}`}
              >
                <span className="studio-cart-name">{c.name}</span>
                <span className="studio-cart-meta mono">
                  {c.hotkey ? <kbd>{c.hotkey.toUpperCase()}</kbd> : <span />}
                  {on && <PollValue read={() => readRemaining(c.id)} format={(v) => `${v.toFixed(1)} s`} intervalMs={100} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
