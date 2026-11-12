"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RadioHeaderButton } from "@/ui/radio/RadioHeaderButton";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/#noticias", label: "Noticias" },
  { href: "/#lanzamientos", label: "Lanzamientos" },
  { href: "/#artistas", label: "Artistas" },
  { href: "/#agenda", label: "Eventos" },
  { href: "/#cultura", label: "Cultura" },
];

export function Mark({ size = 34 }: { size?: number }) {
  return (
    <Image
      src="/brand/stereoface-logo.png"
      width={size}
      height={size}
      sizes={`${size}px`}
      className="shrink-0 rounded-full"
      alt=""
      aria-hidden="true"
    />
  );
}

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const getTheme = () => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function Header() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const theme = useSyncExternalStore<"dark" | "light">(subscribeTheme, getTheme, () => "dark");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // La barra se oculta al bajar y reaparece al subir (no se oculta con el menú abierto).
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setHidden(y > last && y > 240);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sf-theme", next);
    } catch {
      /* almacenamiento no disponible: el tema solo dura la sesión */
    }
  }

  return (
    <>
      <header
        className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: hidden && !open ? "translateY(-100%)" : "none" }}
      >
        <div className="wrap grid grid-cols-[1fr_auto] items-center gap-3 py-3 xl:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="StereoFace, inicio">
            <Mark />
            <span className="display-wide text-[1.05rem] sm:text-[1.3rem]">
              Stereo<span className="text-accent-ink">Face</span>
            </span>
          </Link>

          <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
            {NAV.map((n, i) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={i === 0 ? "page" : undefined}
                className={`mono rounded-full border px-4 py-2 transition-colors ${
                  i === 0
                    ? "border-accent-ink text-accent-ink"
                    : "border-transparent hover:border-line hover:text-accent-ink"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center justify-end gap-2">
            <RadioHeaderButton />
            <button
              type="button"
              onClick={toggleTheme}
              className="btn-icon hidden sm:inline-grid"
              aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                {theme === "dark" ? (
                  <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" />
                  </>
                )}
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="btn !px-4 !py-2 xl:hidden"
              aria-expanded={open}
              aria-controls="menu-overlay"
            >
              {open ? "Cerrar" : "Menú"}
            </button>
          </div>
        </div>
      </header>

      <div
        id="menu-overlay"
        className="menu-overlay xl:hidden"
        data-open={open}
        aria-hidden={!open}
        {...(!open ? { inert: true } : {})}
      >
        <nav aria-label="Menú móvil" className="wrap flex h-full flex-col justify-center gap-1 pt-16">
          {NAV.map((n, i) => (
            <div key={n.href} className="overflow-hidden">
              <Link
                href={n.href}
                onClick={() => setOpen(false)}
                className="display t-xl"
                style={{ ["--i" as string]: i }}
              >
                {n.label}
              </Link>
            </div>
          ))}
          <button type="button" onClick={toggleTheme} className="btn mt-8 w-fit">
            {theme === "dark" ? "Modo claro" : "Modo oscuro"}
          </button>
          <p className="mono muted mt-4">StereoFace · Contenido demostrativo</p>
        </nav>
      </div>
    </>
  );
}
