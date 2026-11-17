"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { adsStore } from "./ads-store";
import { canServeAds } from "./consent";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Espacio publicitario identificado como tal. No ocupa lugar (ni pide nada a Google) sin publicidad activa, bloque configurado y consentimiento. */
export function AdSlot({ name, className = "" }: { name: "home" | "article"; className?: string }) {
  const s = useSyncExternalStore(adsStore.subscribe, adsStore.get, adsStore.server);
  const cfg = s.config;
  const slot = cfg ? (name === "home" ? cfg.slotHome : cfg.slotArticle) : "";
  const show = !!cfg && s.consentLoaded && canServeAds(cfg, s.consent) && slot !== "";
  const pushed = useRef(false);
  useEffect(() => {
    if (!show || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* el script aún no cargó o está bloqueado: el espacio queda vacío */
    }
  }, [show]);
  if (!show || !cfg) return null;
  return (
    <aside className={`ad-slot ${className}`} aria-label="Publicidad">
      <p className="mono muted text-[0.62rem] uppercase tracking-widest">Publicidad</p>
      <ins className="adsbygoogle" style={{ display: "block" }} data-ad-client={cfg.publisherId} data-ad-slot={slot} data-ad-format="auto" data-full-width-responsive="true" />
    </aside>
  );
}
