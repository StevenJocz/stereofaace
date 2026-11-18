"use client";

import { useEffect, useState } from "react";
import { BLOCK_LABEL, FONTS, GRADIENTS, type BlockId, type SpaceDesign } from "@/modules/spaces/design";
import type { MySpace } from "@/modules/spaces/profile";
import type { SpacePrivacy } from "@/modules/spaces/schema";

/** Lo que los paneles necesitan del editor (estado y acciones). */
export type Studio = {
  space: MySpace;
  design: SpaceDesign;
  profile: MySpace["profile"];
  lowContrast: boolean;
  setDesign: (patch: (d: SpaceDesign) => SpaceDesign) => void;
  setProfile: (patch: Partial<MySpace["profile"]>) => void;
  saveGenres: (slugs: string[]) => void;
  saveArtists: (list: MySpace["artists"]) => void;
  applyTheme: (slug: string) => void;
  upload: (kind: string, file: File | undefined) => void;
  removeImage: (id: string) => void;
  changeUsername: (value: string) => void;
  logout: () => Promise<void>;
};

const COLOR_FIELDS: [keyof SpaceDesign["colors"], string][] = [["bg", "Fondo"], ["primary", "Principal"], ["secondary", "Secundario"], ["text", "Texto"], ["link", "Enlaces"], ["card", "Tarjetas"]];
const LINK_FIELDS: [string, string][] = [["instagram", "Instagram"], ["x", "X"], ["tiktok", "TikTok"], ["facebook", "Facebook"], ["youtube", "YouTube"], ["spotify", "Spotify"], ["soundcloud", "SoundCloud"], ["bandcamp", "Bandcamp"], ["web", "Sitio web"]];
const PRIVACY_FIELDS: [keyof SpacePrivacy, string][] = [["listed", "Aparecer en /spaces y en las búsquedas"], ["showLocation", "Mostrar mi ubicación"], ["showJoined", "Mostrar desde cuándo estoy en StereoFace"], ["showLinks", "Mostrar mis enlaces"], ["showFavorites", "Mostrar mis artistas favoritos"], ["showFollows", "Mostrar cuántas personas me siguen y a cuántas sigo"]];
const IMG = "image/jpeg,image/png,image/webp,image/avif";

export function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const n = [...arr];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-3 border-t border-line pt-4 first:border-0 first:pt-0">
      <legend className="mono mb-1 text-accent-ink">{title}</legend>
      {children}
    </fieldset>
  );
}
export const L = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mono muted block">{label}</span>
    {children}
  </label>
);
const Range = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) => (
  <label className="block">
    <span className="mono muted flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </span>
    <input type="range" className="studio-range w-full" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>
);
const Reorder = ({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove?: () => void }) => (
  <>
    <button type="button" aria-label="Subir" className="btn-icon" onClick={onUp}>▲</button>
    <button type="button" aria-label="Bajar" className="btn-icon" onClick={onDown}>▼</button>
    {onRemove && <button type="button" aria-label="Quitar" className="btn-icon" onClick={onRemove}>✕</button>}
  </>
);

export function GenresPanel({ s }: { s: Studio }) {
  const { space, saveGenres } = s;
  return (
    <Section title="Géneros favoritos (ordénalos por preferencia, hasta 8)">
      <ol className="grid gap-1.5">
        {space.genres.map((slug, i) => (
          <li key={slug} className="flex items-center gap-2 rounded-[8px] border border-line px-2 py-1">
            <span className="mono text-accent-ink w-5">{i + 1}</span>
            <span className="flex-1">{space.options.genres.find((g) => g.slug === slug)?.name ?? slug}</span>
            <Reorder onUp={() => saveGenres(move(space.genres, i, -1))} onDown={() => saveGenres(move(space.genres, i, 1))} onRemove={() => saveGenres(space.genres.filter((x) => x !== slug))} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Géneros disponibles">
        {space.options.genres.filter((g) => !space.genres.includes(g.slug)).map((g) => (
          <button key={g.slug} type="button" className="chip-day !w-auto px-3" disabled={space.genres.length >= 8} onClick={() => saveGenres([...space.genres, g.slug])}>
            + {g.name}
          </button>
        ))}
      </div>
    </Section>
  );
}

export function ThemesPanel({ s }: { s: Studio }) {
  return (
    <Section title="Plantilla (puedes cambiarlo todo después)">
      <div className="grid gap-2 sm:grid-cols-2">
        {s.space.options.themes.map((t) => (
          <button key={t.slug} type="button" onClick={() => s.applyTheme(t.slug)} aria-pressed={s.design.theme === t.slug} className={`panel p-3 text-left ${s.design.theme === t.slug ? "!border-accent" : ""}`}>
            <span className="flex gap-1" aria-hidden="true">
              {[t.design.colors.bg, t.design.colors.card, t.design.colors.primary, t.design.colors.secondary].map((c, i) => (
                <span key={i} className="size-5 rounded-full border border-line" style={{ background: c }} />
              ))}
            </span>
            <span className="display-up mt-2 block text-[1rem]">{t.name}</span>
            <span className="mono muted block text-[0.68rem]">{t.description}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function ImagesPanel({ s }: { s: Studio }) {
  const { space, upload, removeImage } = s;
  const gallery = space.assets.filter((a) => a.kind === "gallery");
  const idOf = (kind: string) => space.assets.find((a) => a.kind === kind)?.id;
  return (
    <>
      <Section title="Foto de perfil">
        <div className="flex flex-wrap items-center gap-3">
          {space.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s
            <img src={space.avatarUrl} alt="Tu foto actual" className="size-16 rounded-[10px] object-cover" />
          )}
          <label className="btn cursor-pointer !px-4 !py-2">
            {space.avatarUrl ? "Cambiar foto" : "Subir foto"}
            <input type="file" accept={IMG} hidden onChange={(e) => upload("avatar", e.target.files?.[0])} />
          </label>
          {space.avatarUrl && idOf("avatar") && <button type="button" className="btn !px-4 !py-2" onClick={() => removeImage(idOf("avatar")!)}>Quitar</button>}
        </div>
      </Section>
      <Section title="Imagen de portada">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn cursor-pointer !px-4 !py-2">
            {space.coverUrl ? "Cambiar portada" : "Subir portada"}
            <input type="file" accept={IMG} hidden onChange={(e) => upload("cover", e.target.files?.[0])} />
          </label>
          {space.coverUrl && idOf("cover") && <button type="button" className="btn !px-4 !py-2" onClick={() => removeImage(idOf("cover")!)}>Quitar</button>}
        </div>
      </Section>
      <Section title="Galería (hasta 6 imágenes)">
        <ul className="grid grid-cols-3 gap-2">
          {gallery.map((a) => (
            <li key={a.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- imagen propia servida por /s */}
              <img src={a.url} alt={a.alt ?? ""} className="aspect-square w-full rounded-[8px] object-cover" />
              <button type="button" aria-label="Quitar imagen" className="btn-icon absolute right-1 top-1 bg-black/70" onClick={() => removeImage(a.id)}>✕</button>
            </li>
          ))}
        </ul>
        {gallery.length < 6 && (
          <label className="btn w-fit cursor-pointer !px-4 !py-2">
            Agregar imagen
            <input type="file" accept={IMG} hidden onChange={(e) => upload("gallery", e.target.files?.[0])} />
          </label>
        )}
        <p className="mono muted text-[0.68rem]">JPG, PNG, WebP o AVIF · hasta 5 MB cada una · 30 MB en total. Sube solo imágenes tuyas o con permiso.</p>
      </Section>
    </>
  );
}

export function IdentityPanel({ s }: { s: Studio }) {
  const { profile, setProfile, changeUsername } = s;
  return (
    <>
      <Section title="Tu identidad">
        <L label="Nombre de usuario">
          <input className="input" defaultValue={profile.username} maxLength={20} autoCapitalize="none" onBlur={(e) => e.target.value !== profile.username && changeUsername(e.target.value)} />
        </L>
        <L label="Nombre visible">
          <input className="input" value={profile.displayName} maxLength={40} onChange={(e) => setProfile({ displayName: e.target.value })} />
        </L>
        <L label="Frase personal">
          <input className="input" value={profile.tagline ?? ""} maxLength={120} onChange={(e) => setProfile({ tagline: e.target.value })} />
        </L>
        <L label="Biografía">
          <textarea className="input min-h-[6rem]" value={profile.bio ?? ""} maxLength={500} onChange={(e) => setProfile({ bio: e.target.value })} />
        </L>
        <L label="Ubicación (opcional)">
          <input className="input" value={profile.location ?? ""} maxLength={60} onChange={(e) => setProfile({ location: e.target.value })} />
        </L>
      </Section>
      <GenresPanel s={s} />
      <Section title="Artistas / DJs favoritos (hasta 12)">
        <ArtistPicker artists={s.space.artists} onChange={s.saveArtists} />
      </Section>
      <Section title="Enlaces (https)">
        {LINK_FIELDS.map(([k, label]) => (
          <L key={k} label={label}>
            <input className="input" value={(profile.links as Record<string, string | undefined>)[k] ?? ""} maxLength={300} inputMode="url" placeholder="https://" onChange={(e) => setProfile({ links: { ...profile.links, [k]: e.target.value } })} />
          </L>
        ))}
      </Section>
    </>
  );
}

export function MusicPanel({ s }: { s: Studio }) {
  const { design, setDesign } = s;
  const song = design.player.song;
  const setSong = (patch: Partial<{ title: string; artist: string; url: string | null }>) =>
    setDesign((d) => {
      const next = { title: d.player.song?.title ?? "", artist: d.player.song?.artist ?? "", url: d.player.song?.url ?? null, ...patch };
      return { ...d, player: { ...d.player, song: next.title || next.artist || next.url ? next : null } };
    });
  return (
    <Section title="Reproductor del perfil">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={design.player.showRadio} onChange={(e) => setDesign((d) => ({ ...d, player: { ...d.player, showRadio: e.target.checked } }))} />
        <span>Destacar StereoFace Radio (botón para escuchar la radio)</span>
      </label>
      <p className="mono muted text-[0.68rem]">Nada suena solo: quien visita tu Space decide cuándo escuchar. No se sube ni se redistribuye música.</p>
      <L label="Mi track del momento — título">
        <input className="input" maxLength={80} value={song?.title ?? ""} onChange={(e) => setSong({ title: e.target.value })} />
      </L>
      <L label="Artista">
        <input className="input" maxLength={80} value={song?.artist ?? ""} onChange={(e) => setSong({ artist: e.target.value })} />
      </L>
      <L label="Enlace (Spotify, SoundCloud, YouTube, Bandcamp…)">
        <input className="input" inputMode="url" placeholder="https://" value={song?.url ?? ""} onChange={(e) => setSong({ url: e.target.value || null })} />
      </L>
      {[0, 1, 2].map((i) => (
        <L key={i} label={`Playlist o set externo ${i + 1}`}>
          <input
            className="input"
            inputMode="url"
            placeholder="https://"
            value={design.player.links[i] ?? ""}
            onChange={(e) =>
              setDesign((d) => {
                const links = [...d.player.links];
                links[i] = e.target.value;
                return { ...d, player: { ...d.player, links: links.filter((x, j) => x !== "" || j < i) } };
              })
            }
          />
        </L>
      ))}
    </Section>
  );
}

const colorInput = "h-9 w-11 cursor-pointer rounded border border-line bg-transparent p-0";

export function DesignPanel({ s }: { s: Studio }) {
  const { design, setDesign, lowContrast } = s;
  const bg = design.background;
  const setBg = (patch: Partial<SpaceDesign["background"]>) => setDesign((d) => ({ ...d, background: { ...d.background, ...patch } }));
  return (
    <>
      <ThemesPanel s={s} />
      <Section title="Colores">
        <div className="grid grid-cols-2 gap-3">
          {COLOR_FIELDS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="color" aria-label={label} value={design.colors[k]} onChange={(e) => setDesign((d) => ({ ...d, colors: { ...d.colors, [k]: e.target.value } }))} className={colorInput} />
              <span className="mono text-[0.72rem]">{label}</span>
            </label>
          ))}
        </div>
        <Range label="Transparencia de las tarjetas" value={design.cardOpacity} min={20} max={100} onChange={(n) => setDesign((d) => ({ ...d, cardOpacity: n }))} />
        {lowContrast && <p role="alert" className="mono text-[#ffb020] text-[0.75rem]">El texto casi no se lee sobre las tarjetas: sube el contraste (así no se guarda).</p>}
      </Section>
      <Section title="Bordes">
        <Range label="Grosor" value={design.border.width} min={0} max={4} onChange={(n) => setDesign((d) => ({ ...d, border: { ...d.border, width: n } }))} />
        <Range label="Redondeo" value={design.border.radius} min={0} max={28} onChange={(n) => setDesign((d) => ({ ...d, border: { ...d.border, radius: n } }))} />
        <label className="flex items-center gap-2">
          <input type="color" aria-label="Color del borde" value={design.border.color} onChange={(e) => setDesign((d) => ({ ...d, border: { ...d.border, color: e.target.value } }))} className={colorInput} />
          <span className="mono text-[0.72rem]">Color del borde</span>
        </label>
      </Section>
      <Section title="Fondo">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de fondo">
          {([["color", "Color liso"], ["gradient", "Degradado"], ["image", "Imagen"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={bg.kind === k} className={`chip-day !w-auto px-3 ${bg.kind === k ? "is-on" : ""}`} onClick={() => setBg({ kind: k, assetId: k === "image" ? bg.assetId : null })}>
              {label}
            </button>
          ))}
        </div>
        {bg.kind === "gradient" && (
          <div className="flex flex-wrap gap-2">
            {GRADIENTS.map((g) => (
              <button key={g.id} type="button" aria-label={g.name} aria-pressed={bg.gradient === g.id} onClick={() => setBg({ gradient: g.id })} className={`h-10 w-16 rounded-md border ${bg.gradient === g.id ? "border-accent" : "border-line"}`} style={{ background: g.css }} title={g.name} />
            ))}
          </div>
        )}
        {bg.kind === "image" && (
          <>
            <label className="btn w-fit cursor-pointer !px-4 !py-2">
              {bg.assetId ? "Cambiar imagen de fondo" : "Subir imagen de fondo"}
              <input type="file" accept={IMG} hidden onChange={(e) => s.upload("background", e.target.files?.[0])} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <L label="Posición">
                <select className="input" value={bg.position} onChange={(e) => setBg({ position: e.target.value as SpaceDesign["background"]["position"] })}>
                  {(["center", "top", "bottom", "left", "right"] as const).map((p) => (
                    <option key={p} value={p}>{{ center: "Centro", top: "Arriba", bottom: "Abajo", left: "Izquierda", right: "Derecha" }[p]}</option>
                  ))}
                </select>
              </L>
              <L label="Tamaño">
                <select className="input" value={bg.size} onChange={(e) => setBg({ size: e.target.value as SpaceDesign["background"]["size"] })}>
                  <option value="cover">Cubrir</option>
                  <option value="contain">Ajustar</option>
                  <option value="auto">Original</option>
                </select>
              </L>
            </div>
            <Range label="Oscurecer la imagen" value={bg.overlay} min={0} max={80} onChange={(n) => setBg({ overlay: n })} />
          </>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={bg.fixed} onChange={(e) => setBg({ fixed: e.target.checked })} />
          <span>Fondo fijo (no se desplaza con la página)</span>
        </label>
      </Section>
      <Section title="Tipografía">
        <div className="grid grid-cols-2 gap-3">
          {(["heading", "body"] as const).map((k) => (
            <L key={k} label={k === "heading" ? "Títulos" : "Texto"}>
              <select className="input" value={design.font[k]} onChange={(e) => setDesign((d) => ({ ...d, font: { ...d.font, [k]: e.target.value as SpaceDesign["font"]["heading"] } }))}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </L>
          ))}
        </div>
        <Range label="Tamaño del texto (%)" value={design.font.scale} min={90} max={115} onChange={(n) => setDesign((d) => ({ ...d, font: { ...d.font, scale: n } }))} />
      </Section>
    </>
  );
}

export function BlocksPanel({ s }: { s: Studio }) {
  const { design, setDesign } = s;
  return (
    <>
      <Section title="Bloques (muestra, oculta y reordena)">
        <ol className="grid gap-1.5">
          {design.blocks.map((b, i) => (
            <li key={b.id} className="flex items-center gap-2 rounded-[8px] border border-line px-2 py-1">
              <input type="checkbox" aria-label={`Mostrar ${BLOCK_LABEL[b.id as BlockId]}`} checked={b.visible} onChange={(e) => setDesign((d) => ({ ...d, blocks: d.blocks.map((x) => (x.id === b.id ? { ...x, visible: e.target.checked } : x)) }))} />
              <span className="flex-1">{BLOCK_LABEL[b.id as BlockId]}</span>
              <Reorder onUp={() => setDesign((d) => ({ ...d, blocks: move(d.blocks, i, -1) }))} onDown={() => setDesign((d) => ({ ...d, blocks: move(d.blocks, i, 1) }))} />
            </li>
          ))}
        </ol>
        <p className="mono muted text-[0.68rem]">El orden vale dentro de cada columna: sobre mí, géneros, artistas, frase e información, a la izquierda; reproductor, galería y enlaces, a la derecha.</p>
      </Section>
      <Section title="Frase">
        <textarea className="input" rows={2} maxLength={200} value={design.quote} onChange={(e) => setDesign((d) => ({ ...d, quote: e.target.value }))} aria-label="Frase" />
      </Section>
      <Section title="Información musical">
        {([["favoriteSong", "Canción favorita"], ["favoriteArtist", "Artista favorito"], ["since", "Escucho electrónica desde…"], ["scene", "Mi escena"]] as const).map(([k, label]) => (
          <L key={k} label={label}>
            <input className="input" maxLength={k === "since" ? 30 : k === "scene" ? 60 : 80} value={design.musicinfo[k]} onChange={(e) => setDesign((d) => ({ ...d, musicinfo: { ...d.musicinfo, [k]: e.target.value } }))} />
          </L>
        ))}
      </Section>
    </>
  );
}

export function PrivacyPanel({ s }: { s: Studio }) {
  const { profile, setProfile, logout } = s;
  return (
    <Section title="Privacidad: tú decides qué se ve">
      {PRIVACY_FIELDS.map(([k, label]) => (
        <label key={k} className="flex items-center gap-2">
          <input type="checkbox" checked={profile.privacy[k]} onChange={(e) => setProfile({ privacy: { ...profile.privacy, [k]: e.target.checked } })} />
          <span>{label}</span>
        </label>
      ))}
      <p className="mono muted text-[0.68rem]">Tu correo nunca se muestra.</p>
      <form action={logout}>
        <button type="submit" className="btn !px-4 !py-2">Cerrar sesión</button>
      </form>
    </Section>
  );
}

/** Selector de artistas favoritos: busca en el catálogo de StereoFace o permite escribir un nombre. */
function ArtistPicker({ artists, onChange }: { artists: MySpace["artists"]; onChange: (a: MySpace["artists"]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(() => {
      fetch(`/api/spaces/artists?q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((h: { id: string; name: string }[]) => setHits(h))
        .catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const add = (a: { artistId: string | null; name: string }) => {
    if (artists.length >= 12 || artists.some((x) => x.name.toLowerCase() === a.name.toLowerCase())) return;
    onChange([...artists, a]);
    setQ("");
    setHits([]);
  };
  const shown = q.trim().length >= 2 ? hits : [];
  return (
    <>
      <ol className="grid gap-1.5">
        {artists.map((a, i) => (
          <li key={`${a.name}-${i}`} className="flex items-center gap-2 rounded-[8px] border border-line px-2 py-1">
            <span className="flex-1">
              {a.name}
              {a.artistId && <span className="mono text-accent-ink text-[0.65rem]"> · catálogo</span>}
            </span>
            <Reorder onUp={() => onChange(move(artists, i, -1))} onDown={() => onChange(move(artists, i, 1))} onRemove={() => onChange(artists.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Busca o escribe un artista" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} aria-label="Buscar artista" />
        <button type="button" className="btn" disabled={q.trim().length < 1} onClick={() => add({ artistId: null, name: q.trim() })}>
          Agregar
        </button>
      </div>
      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Sugerencias del catálogo">
          {shown.map((h) => (
            <li key={h.id}>
              <button type="button" className="chip-day !w-auto px-3" onClick={() => add({ artistId: h.id, name: h.name })}>
                + {h.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
