"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import type { AdsConfig } from "@/modules/settings/ads";
import { adsStore } from "./ads-store";
import { canServeAds, shouldShowBanner } from "./consent";

let scriptLoaded = false;

/** Pasa la configuración al navegador, carga el script de anuncios solo con consentimiento y muestra el aviso de cookies. */
export function AdsBridge({ config }: { config: AdsConfig }) {
  const s = useSyncExternalStore(adsStore.subscribe, adsStore.get, adsStore.server);

  useEffect(() => {
    adsStore.setConfig(config);
    adsStore.loadConsent();
  }, [config]);

  const serve = s.consentLoaded && canServeAds(config, s.consent);
  useEffect(() => {
    if (!serve || scriptLoaded || !config.publisherId) return;
    scriptLoaded = true;
    const el = document.createElement("script");
    el.async = true;
    el.crossOrigin = "anonymous";
    el.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(config.publisherId)}`;
    document.head.appendChild(el);
  }, [serve, config.publisherId]);

  const open = s.consentLoaded && (shouldShowBanner(config, s.consent) || (config.enabled && s.reopened));
  if (!open) return null;
  return (
    <div role="dialog" aria-label="Aviso de cookies" className="cookie-banner">
      <p className="text-[0.88rem]">
        Usamos cookies necesarias para que el sitio funcione y, si las aceptas, cookies de publicidad de terceros (Google AdSense) para mostrar anuncios. Puedes
        cambiar tu decisión cuando quieras en «Preferencias de cookies».{" "}
        <Link href="/pagina/cookies" className="underline">
          Política de cookies
        </Link>
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button type="button" className="btn !px-4 !py-1.5" onClick={() => adsStore.decide(false)}>
          Solo necesarias
        </button>
        <button type="button" className="btn btn-accent !px-4 !py-1.5" onClick={() => adsStore.decide(true)}>
          Aceptar
        </button>
      </div>
    </div>
  );
}

/** Enlace del pie de página para volver a decidir; solo existe si hay publicidad activa. */
export function CookiePrefsLink() {
  const s = useSyncExternalStore(adsStore.subscribe, adsStore.get, adsStore.server);
  if (!s.config?.enabled) return null;
  return (
    <button type="button" className="text-left hover:text-accent-ink" onClick={() => adsStore.reopen()}>
      Preferencias de cookies
    </button>
  );
}
