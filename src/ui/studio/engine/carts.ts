import type { CartKind, CartView } from "@/modules/studio/carts";

export const CART_KIND_LABEL: Record<CartKind, string> = {
  jingle: "Jingles",
  promo: "Promos",
  sweeper: "Cortinillas",
  effect: "Efectos",
  ad: "Anuncios",
  id: "Identificaciones",
};

/** Agrupa los carts por tipo (todos los tipos presentes, aunque vacíos) y los ordena por posición. */
export function groupByKind(carts: CartView[]): Record<CartKind, CartView[]> {
  const out = Object.fromEntries((Object.keys(CART_KIND_LABEL) as CartKind[]).map((k) => [k, [] as CartView[]])) as Record<CartKind, CartView[]>;
  for (const c of [...carts].sort((a, b) => a.position - b.position)) out[c.kind].push(c);
  return out;
}

/** Tecla (minúscula) → id de cart. Los carts sin atajo se ignoran y, si hay duplicados, gana el primero. */
export function hotkeyMap(carts: CartView[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of carts) {
    const k = c.hotkey?.toLowerCase();
    if (k && !m.has(k)) m.set(k, c.id);
  }
  return m;
}

/** ¿El foco está en un campo donde se escribe? Los atajos no deben dispararse ahí. */
export function isTypingTarget(el: { tagName: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}
