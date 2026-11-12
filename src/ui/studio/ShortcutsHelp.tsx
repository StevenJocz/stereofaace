"use client";

import { useEffect, useRef, useState } from "react";

const SHORTCUTS: [string, string][] = [
  ["Espacio", "Play / pausa del deck al aire"],
  ["V (mantener)", "Hablar por el micrófono mientras está silenciado"],
  ["1–9, A–Z de un cart", "Disparar ese jingle, promo o efecto (el atajo se ve en el botón)"],
  ["Esc", "Detener todos los carts"],
  ["?", "Mostrar u ocultar esta ayuda"],
];

/** Botón «?» que abre una ventana con los atajos de teclado (también con la tecla ?). */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "?") setOpen((o) => !o);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <>
      <button type="button" className="btn !px-3 !py-1" onClick={() => setOpen(true)} aria-label="Atajos de teclado" title="Atajos de teclado (?)">
        ?
      </button>
      <dialog ref={ref} className="studio-dialog" onClose={() => setOpen(false)} aria-label="Atajos de teclado">
        <h2 className="display-up text-[1.4rem]">Atajos de teclado</h2>
        <dl className="mt-3 grid gap-2">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex gap-3">
              <dt className="mono w-44 shrink-0 text-accent-ink">{k}</dt>
              <dd>{d}</dd>
            </div>
          ))}
        </dl>
        <p className="mono muted mt-3">Deja esta pestaña abierta mientras transmites: si se cierra, la radio vuelve al AutoDJ.</p>
        <button type="button" className="btn btn-accent mt-4" onClick={() => setOpen(false)}>
          Cerrar
        </button>
      </dialog>
    </>
  );
}
