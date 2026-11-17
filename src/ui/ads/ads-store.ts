import type { AdsConfig } from "@/modules/settings/ads";
import { CONSENT_KEY, parseConsent, serializeConsent, type Consent } from "./consent";

export type AdsState = { config: AdsConfig | null; consent: Consent; consentLoaded: boolean; reopened: boolean };

const INITIAL: AdsState = { config: null, consent: { ads: null }, consentLoaded: false, reopened: false };
let state: AdsState = INITIAL;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (patch: Partial<AdsState>) => {
  state = { ...state, ...patch };
  emit();
};

export const adsStore = {
  get: () => state,
  server: () => INITIAL,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  setConfig(config: AdsConfig) {
    set({ config });
  },
  /** Lee la decisión guardada en este navegador (solo existe en el cliente). */
  loadConsent() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(CONSENT_KEY);
    } catch {
      /* sin almacenamiento: se pregunta en cada visita */
    }
    set({ consent: parseConsent(raw), consentLoaded: true });
  },
  decide(ads: boolean) {
    try {
      localStorage.setItem(CONSENT_KEY, serializeConsent(ads, new Date()));
    } catch {
      /* la decisión vale solo para esta visita */
    }
    set({ consent: { ads }, reopened: false });
  },
  reopen() {
    set({ reopened: true });
  },
};
