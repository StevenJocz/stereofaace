"use client";

import { useRef } from "react";

export type RailItem = { label: string; href: string; color: string; icon: string };

/** Riel de categorías: anclas reales a secciones de la página y flechas que desplazan el riel. */
export function Rail({ items }: { items: RailItem[] }) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) =>
    ref.current?.scrollBy({
      left: dir * Math.max(240, (ref.current?.clientWidth ?? 600) * 0.6),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn-icon hidden shrink-0 md:inline-grid"
        aria-label="Categorías anteriores"
        onClick={() => scroll(-1)}
      >
        ‹
      </button>
      <ul ref={ref} className="rail min-w-0 flex-1">
        {items.map((c) => (
          <li key={c.label} className="flex-none">
            <a href={c.href} className="chip" style={{ ["--cover" as string]: c.color }}>
              <span>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden="true"
                >
                  <path d={c.icon} />
                </svg>
                {c.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-icon hidden shrink-0 md:inline-grid"
        aria-label="Categorías siguientes"
        onClick={() => scroll(1)}
      >
        ›
      </button>
    </div>
  );
}
