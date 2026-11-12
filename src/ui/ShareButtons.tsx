"use client";

import { useState } from "react";

/** Compartir: enlaces reales a cada red y copiar enlace (portapapeles). No carga scripts de terceros. */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { label: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Compartir artículo">
      <span className="mono text-muted">Compartir</span>
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="btn !px-3.5 !py-1.5">
          {l.label}
        </a>
      ))}
      <button
        type="button"
        className="btn !px-3.5 !py-1.5"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          } catch {
            window.prompt("Copia el enlace:", url);
          }
        }}
      >
        {copied ? "Enlace copiado" : "Copiar enlace"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Enlace copiado al portapapeles" : ""}
      </span>
    </div>
  );
}
