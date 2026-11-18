import Link from "next/link";
import type { CSSProperties } from "react";
import type { PublicSpace } from "@/modules/spaces/public";
import { BLOCK_LABEL, designVars, orderedBlocks, parseSpotify, parseYouTube, safeUrl, spotifyEmbedSrc, spotifyHref, youtubeEmbedSrc, type BlockId } from "@/modules/spaces/design";
import { SpaceEmbed } from "./SpaceEmbed";
import { SpaceActions, SpaceFollow, SpaceRadio } from "./SpaceIslands";

const LINK_LABEL: Record<string, string> = { instagram: "Instagram", x: "X", tiktok: "TikTok", facebook: "Facebook", youtube: "YouTube", spotify: "Spotify", soundcloud: "SoundCloud", bandcamp: "Bandcamp", web: "Sitio web" };
const NAV: [BlockId, string][] = [["about", "Mi Space"], ["player", "Música"], ["gallery", "Galería"], ["artists", "Favoritos"], ["links", "Enlaces"]];

const joined = (iso: string) => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" }).format(new Date(iso));

function Card({ id, title, children }: { id: BlockId; title: string; children: React.ReactNode }) {
  return (
    <section id={`sp-${id}`} className="space-card" aria-label={title}>
      <h2 className="space-h">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Un Space renderizado desde su diseño estructurado. Sin HTML ni CSS de la persona: todo el texto se escapa (React) y el estilo
 * llega solo como variables CSS validadas, dentro de `.space`, así que no puede tocar el resto del sitio.
 * Es el mismo componente para la vista pública y para la vista previa del editor.
 */
export function SpaceView({ space, preview = false, viewerIsStaff = false }: { space: PublicSpace; preview?: boolean; viewerIsStaff?: boolean }) {
  const d = space.design;
  const vars = designVars(d, space.backgroundUrl) as CSSProperties;
  const has: Record<BlockId, boolean> = {
    about: Boolean(space.bio || space.tagline),
    genres: space.genres.length > 0,
    artists: space.artists.length > 0,
    player: d.player.showRadio || Boolean(d.player.song) || d.player.links.length > 0 || Boolean(d.player.spotify.profile || d.player.spotify.playlist) || d.player.videos.length > 0,
    gallery: space.gallery.length > 0,
    links: Object.keys(space.links).length > 0,
    quote: Boolean(d.quote),
    musicinfo: Object.values(d.musicinfo).some(Boolean),
  };
  const sp = (u: string | null, kinds: ("artist" | "user" | "playlist")[]) => {
    const r = u ? parseSpotify(u, kinds) : null;
    return r ? { src: spotifyEmbedSrc(r), href: spotifyHref(r) } : null;
  };
  const spotifyProfile = sp(d.player.spotify.profile, ["artist", "user"]);
  const spotifyPlaylist = sp(d.player.spotify.playlist, ["playlist"]);
  const videoIds = d.player.videos.map((v) => parseYouTube(v)).filter((v): v is string => v !== null);
  const show = (id: BlockId) => has[id] || (space.isOwner && preview);

  const render: Record<BlockId, () => React.ReactNode> = {
    about: () => (
      <Card id="about" title="Sobre mí">
        {space.tagline && <p className="space-tagline">{space.tagline}</p>}
        {space.bio ? <p className="space-bio">{space.bio}</p> : <p className="space-empty">Cuéntale a la comunidad quién eres.</p>}
      </Card>
    ),
    genres: () => (
      <Card id="genres" title="Géneros favoritos">
        {space.genres.length ? (
          <ul className="space-chips">
            {space.genres.map((g, i) => (
              <li key={g.slug} data-top={i === 0}>
                {g.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-empty">Elige tus géneros para que te encuentren.</p>
        )}
      </Card>
    ),
    artists: () => (
      <Card id="artists" title="Artistas / DJs favoritos">
        {space.artists.length ? (
          <ul className="space-artists">
            {space.artists.map((a) => (
              <li key={a.name}>
                <div className="space-artist-img">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por /media
                    <img src={a.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">{a.name.slice(0, 1)}</span>
                  )}
                </div>
                {a.slug ? <Link href={`/artistas/${a.slug}`}>{a.name}</Link> : <span>{a.name}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-empty">Agrega tus artistas, bandas y DJs favoritos.</p>
        )}
      </Card>
    ),
    quote: () => (
      <section id="sp-quote" className="space-card space-quote" aria-label="Frase">
        {d.quote ? <blockquote>“{d.quote}”</blockquote> : <p className="space-empty">Una frase que te represente.</p>}
      </section>
    ),
    musicinfo: () => (
      <Card id="musicinfo" title="Información musical">
        <dl className="space-info">
          {([["Canción favorita", d.musicinfo.favoriteSong], ["Artista favorito", d.musicinfo.favoriteArtist], ["Escucha desde", d.musicinfo.since], ["Escena", d.musicinfo.scene]] as const)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
        </dl>
      </Card>
    ),
    player: () => (
      <Card id="player" title="Música">
        {d.player.showRadio && <SpaceRadio />}
        {d.player.song && (
          <div className="space-track">
            <p className="space-track-label">Mi track del momento</p>
            <p className="space-track-title">{d.player.song.title}</p>
            <p className="space-track-artist">{d.player.song.artist}</p>
            {d.player.song.url && safeUrl(d.player.song.url, null) && (
              <a href={d.player.song.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="space-btn">
                Escuchar ↗
              </a>
            )}
          </div>
        )}
        {spotifyProfile && (
          <>
            {spotifyProfile.src ? (
              <SpaceEmbed src={spotifyProfile.src} title="Mi perfil en Spotify" provider="Spotify" height={352} />
            ) : (
              <a href={spotifyProfile.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="space-btn">
                Mi perfil en Spotify ↗
              </a>
            )}
          </>
        )}
        {spotifyPlaylist?.src && <SpaceEmbed src={spotifyPlaylist.src} title="Mi playlist en Spotify" provider="Spotify" height={352} />}
        {videoIds.map((id, i) => (
          <SpaceEmbed key={id} src={youtubeEmbedSrc(id)} title={videoIds.length > 1 ? `Mi video ${i + 1} en YouTube` : "Mi video en YouTube"} provider="YouTube" ratio="16 / 9" />
        ))}
        {d.player.links.length > 0 && (
          <ul className="space-links">
            {d.player.links.map((u) => (
              <li key={u}>
                <a href={u} target="_blank" rel="noopener noreferrer nofollow ugc">
                  {new URL(u).hostname.replace(/^www\./, "")} ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    ),
    gallery: () => (
      <Card id="gallery" title="Galería">
        {space.gallery.length ? (
          <ul className="space-gallery">
            {space.gallery.map((g) => (
              <li key={g.url}>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s */}
                <img src={g.url} alt={g.alt ?? ""} loading="lazy" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-empty">Sube hasta 6 imágenes.</p>
        )}
      </Card>
    ),
    links: () => (
      <Card id="links" title="Enlaces">
        {Object.keys(space.links).length ? (
          <ul className="space-links">
            {Object.entries(space.links).map(([k, u]) => (
              <li key={k}>
                <a href={u} target="_blank" rel="noopener noreferrer nofollow ugc">
                  {LINK_LABEL[k] ?? k} ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="space-empty">Agrega tus redes y plataformas.</p>
        )}
      </Card>
    ),
  };

  const col = (c: "main" | "side") => orderedBlocks(d, c).filter(show);
  const nav = NAV.filter(([id]) => d.blocks.find((b) => b.id === id)?.visible && show(id));

  return (
    <div className="space" style={vars} data-preview={preview || undefined}>
      <header className="space-cover" style={space.coverUrl ? ({ ["--sp-cover" as string]: `url("${space.coverUrl}")` } as CSSProperties) : undefined} data-has-cover={Boolean(space.coverUrl)}>
        <div className="space-cover-fade" aria-hidden="true" />
      </header>

      <div className="space-wrap">
        <div className="space-head">
          <div className="space-avatar">
            {space.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s
              <img src={space.avatarUrl} alt={`Foto de ${space.displayName}`} />
            ) : (
              <span aria-hidden="true">{space.displayName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="space-id">
            <h1 className="space-name">@{space.username}</h1>
            <p className="space-display">{space.displayName}</p>
            <ul className="space-meta">
              {space.location && <li>📍 {space.location}</li>}
              {space.joinedAt && <li>En StereoFace desde {joined(space.joinedAt)}</li>}
              {space.featured && <li>★ Destacado</li>}
            </ul>
            {space.follows && <SpaceFollow username={space.username} initial={space.follows} viewerFollows={space.viewerFollows} viewerSignedIn={space.viewerSignedIn} isOwner={space.isOwner} interactive={!preview} />}
          </div>
          {!preview && <SpaceActions username={space.username} isOwner={space.isOwner} isDraft={space.isDraftPreview} staffAdmin={space.isOwner && viewerIsStaff} />}
        </div>

        <div className="space-body">
          {nav.length > 0 && (
            <nav className="space-nav" aria-label="Secciones del Space">
              {nav.map(([id, label]) => (
                <a key={id} href={`#sp-${id}`}>
                  {label}
                </a>
              ))}
              <p className="space-motto" aria-hidden="true">
                TU ESPACIO.
                <br />
                TU SONIDO.
                <br />
                TU IDENTIDAD.
              </p>
            </nav>
          )}
          <div className="space-main">
            {col("main").map((id) => (
              <div key={id}>{render[id]()}</div>
            ))}
          </div>
          <div className="space-side">
            {col("side").map((id) => (
              <div key={id}>{render[id]()}</div>
            ))}
          </div>
        </div>
      </div>
      <p className="sr-only">{BLOCK_LABEL.about}</p>
    </div>
  );
}
