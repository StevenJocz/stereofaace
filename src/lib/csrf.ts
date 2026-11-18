/**
 * Defensa CSRF de las rutas que cambian estado: además de la cookie SameSite=Lax, el `Origin` debe ser el propio sitio.
 * (`allowed` son los orígenes aceptados: el de `NEXT_PUBLIC_SITE_URL` y el del `Host` de la petición.)
 */
export function sameOrigin(request: Request, siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const allowed = new Set<string>([new URL(siteUrl).origin]);
  if (host) for (const proto of ["https", "http"]) allowed.add(`${proto}://${host}`);
  return allowed.has(origin);
}

