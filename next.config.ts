import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad. Nginx añade HSTS y el resto del endurecimiento TLS.
 * El CSP solo limita lo que no depende de scripts en línea (el sitio usa un script de arranque
 * y JSON-LD en línea): ver «Pendiente» en docs/despliegue.md para un CSP con nonce.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
];

const nextConfig: NextConfig = {
  // Imagen de producción mínima (Docker): .next/standalone con solo lo necesario para ejecutar.
  output: "standalone",
  poweredByHeader: false,
  cacheComponents: true,
  // Drivers de base de datos: se cargan desde node_modules en el servidor, no se empaquetan.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
