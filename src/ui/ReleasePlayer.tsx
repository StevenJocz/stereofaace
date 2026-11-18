import type { ReleaseEmbed } from "@/modules/releases/embed";

/** Reproductor oficial incrustado (Spotify, YouTube…) con sandbox; si no se puede incrustar, un botón al proveedor. */
export function ReleasePlayer({ embed }: { embed: ReleaseEmbed }) {
  if (embed.kind === "link") {
    return (
      <a href={embed.href} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-accent">
        Escuchar en {embed.provider} ↗
      </a>
    );
  }
  return (
    <iframe
      src={embed.src}
      title={embed.title}
      loading="lazy"
      className="w-full rounded-[12px] border-0"
      style={embed.ratio ? { aspectRatio: embed.ratio } : { height: embed.height }}
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      allow="encrypted-media; fullscreen; picture-in-picture; clipboard-write"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
  );
}
