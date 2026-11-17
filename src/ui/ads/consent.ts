import type { AdsConfig } from "@/modules/settings/ads";

export const CONSENT_KEY = "sf-consent";
export type Consent = { ads: boolean | null };

/** Lee la decisión guardada; cualquier valor dañado cuenta como «sin decisión». */
export function parseConsent(raw: string | null): Consent {
  try {
    const v = raw ? (JSON.parse(raw) as { ads?: unknown }) : null;
    return { ads: typeof v?.ads === "boolean" ? v.ads : null };
  } catch {
    return { ads: null };
  }
}

export const serializeConsent = (ads: boolean, now: Date): string => JSON.stringify({ ads, at: now.toISOString() });

/** El aviso solo existe si hay publicidad activa y todavía no se decidió. */
export const shouldShowBanner = (cfg: AdsConfig, c: Consent): boolean => cfg.enabled && c.ads === null;

/** Solo se cargan anuncios con publicidad activa y consentimiento explícito. */
export const canServeAds = (cfg: AdsConfig, c: Consent): boolean => cfg.enabled && c.ads === true;
