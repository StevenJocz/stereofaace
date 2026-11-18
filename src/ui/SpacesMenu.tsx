"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type Status = { signedIn: false } | { signedIn: true; hasSpace: false } | { signedIn: true; hasSpace: true; username: string; avatarUrl: string | null; disabled: boolean };

/**
 * Icono de perfil del encabezado: al pasar el mouse (o con foco/clic, en táctil y teclado) abre una ventanita con una
 * explicación breve de «Mi Space» y el botón para ir a él o crearlo. El estado de sesión se consulta al cargar (endpoint mínimo).
 */
export function SpacesMenu() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const id = useId();

  const load = useCallback(() => {
    fetch("/api/spaces/status", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((s) => s && setStatus(s))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  const show = () => {
    clearTimeout(timer.current);
    if (!open) load();
    setOpen(true);
  };
  const hideSoon = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 160);
  };

  const mine = status?.signedIn && status.hasSpace ? status : null;
  const cta = mine ? { href: "/spaces/editar", label: "Ir a mi Space" } : status?.signedIn ? { href: "/spaces/crear", label: "Crear mi Space" } : { href: "/spaces/registro", label: "Crear mi Space" };

  return (
    <div ref={root} className="spm" onMouseEnter={show} onMouseLeave={hideSoon} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && hideSoon()} onFocus={show}>
      <button type="button" className="btn-icon spm-btn" aria-label="Mi Space" aria-expanded={open} aria-controls={id} onClick={show} data-has={mine ? "true" : undefined}>
        {mine?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por /s
          <img src={mine.avatarUrl} alt="" className="spm-avatar" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.8" />
            <path d="M4.5 20.5c.7-3.9 3.6-6 7.5-6s6.8 2.1 7.5 6" />
          </svg>
        )}
      </button>
      <div id={id} className="spm-pop" role="region" aria-label="Mi Space" hidden={!open}>
        <p className="mono spm-kicker">StereoFace Spaces</p>
        <p className="spm-title">{mine ? `@${mine.username}` : "Mi Space"}</p>
        <p className="spm-text">{mine ? "Tu perfil dentro de StereoFace: edítalo, cambia tu estilo y compártelo." : "Tu perfil propio en StereoFace: tu música, tu estilo y tu gente. Gratis."}</p>
        <Link href={cta.href} className="btn btn-accent spm-cta" onClick={() => setOpen(false)}>
          {cta.label}
        </Link>
        <Link href="/spaces" className="spm-more" onClick={() => setOpen(false)}>
          Explorar Spaces →
        </Link>
      </div>
    </div>
  );
}
