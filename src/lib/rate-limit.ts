/**
 * Límite de tasa de ventana deslizante en memoria. Sirve para un solo proceso (desarrollo y servidor
 * pequeño); con varias instancias se sustituye por Redis (ver ARCHITECTURE.md).
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: boolean; retryAfterMs: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterMs: windowMs - (now - recent[0]) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return { ok: true, retryAfterMs: 0 };
}

export function resetRateLimits() {
  hits.clear();
}
