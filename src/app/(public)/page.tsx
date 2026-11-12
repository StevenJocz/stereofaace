import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Art, TONES } from "@/ui/Art";
import { ArticleCover } from "@/ui/ArticleCover";
import { StereoImage } from "@/ui/StereoImage";
import { Barcode } from "@/ui/Barcode";
import { Ticker } from "@/ui/Ticker";
import { HeroSlider, type HeroSlideView } from "@/ui/HeroSlider";
import { splitHeroTitle } from "@/ui/hero-copy";
import { Rail, type RailItem } from "@/ui/Rail";
import { NewsletterForm } from "@/ui/NewsletterForm";
import { getDb } from "@/lib/db";
import { DEFAULT_SITE_SETTINGS, getSiteSettings } from "@/modules/settings/site";
import { MotionReady } from "@/ui/MotionReady";
import { formatAgendaDate, formatDayMonth, formatShortDate, timeAgoEs } from "@/lib/time";
import { RELEASE_KIND_LABEL } from "@/lib/labels";
import { getHomeData, type HeroSlide, type StoryCard } from "@/modules/content/service";
import type { Tone } from "@/modules/media/cover-art";

const RAIL: RailItem[] = [
  {
    label: "Electrónica",
    href: "#electronica",
    color: "#c6ff00",
    icon: "M3 12h2M7 8v8M11 4v16M15 7v10M19 10v4M21 12h0",
  },
  {
    label: "Indie",
    href: "#indie",
    color: "#ff8a4c",
    icon: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 11a1 1 0 1 0 1 1",
  },
  { label: "Tech", href: "#destacados", color: "#5ad1ff", icon: "M9 3v18M15 3v18M3 9h18M3 15h18" },
  { label: "Festivales", href: "#agenda", color: "#c6ff00", icon: "M3 21l4-10 3 6 3-9 3 8 4-5" },
  {
    label: "Entrevistas",
    href: "#editor",
    color: "#ffd23f",
    icon: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4",
  },
  {
    label: "Cultura",
    href: "#cultura",
    color: "#a77bff",
    icon: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  },
];

const FALLBACK_ART = { scene: "grid", tone: "mono", seed: 1 } as const;

/** Color de texto legible en ambos temas para un tono de escena. */
const inkFor = (t: Tone) => (t === "acid" ? "var(--accent-ink)" : t === "violet" ? "var(--violet)" : "var(--fg)");

function SectionHead({
  n,
  label,
  id,
  children,
}: {
  n: string;
  label: string;
  id?: string;
  children?: React.ReactNode;
}) {
  return (
    <div id={id} className="wrap scroll-mt-24">
      <div className="flex items-baseline justify-between gap-4 border-t border-line pb-6 pt-3">
        <span className="mono">
          <span className="text-accent-ink">{n}</span> / {label}
        </span>
        {children}
      </div>
    </div>
  );
}

function Mask({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`mask ${className}`}>
      <span className="mask-in">{children}</span>
    </span>
  );
}

function Thumb({ s, ratio = "4 / 3" }: { s: StoryCard; ratio?: string }) {
  return <ArticleCover s={s} ratio={ratio} />;
}

function Meta({ s }: { s: StoryCard }) {
  return (
    <p className="mono muted flex flex-wrap gap-x-3">
      <span className="text-fg">{s.kicker ?? s.categoryName}</span>
      <span>{formatShortDate(s.publishedAt)}</span>
      {s.readMinutes && <span>{s.readMinutes} min</span>}
    </p>
  );
}

function heroView(h: HeroSlide | StoryCard): HeroSlideView {
  const a = h.coverArt ?? FALLBACK_ART;
  const config: Partial<HeroSlide["config"]> = "config" in h ? h.config : {};
  const lines = splitHeroTitle(h.title);
  return {
    id: h.id,
    path: config.path ?? ["Música", "Cultura", "Escena"],
    lines,
    accentFrom: Math.min(config.accentFrom ?? lines.length - 1, lines.length - 1),
    phrase: config.phrase,
    dek: h.dek ?? "",
    tone: a.tone,
    art: config.figure ? "figure" : a.scene,
    seed: a.seed,
    coverUrl: h.coverUrl ?? undefined,
    coverAlt: h.coverAlt ?? h.title,
    href: `/noticias/${h.slug}`,
    cta: config.cta ?? "Leer más",
    meta: config.meta ?? "",
    place: config.place ?? "StereoFace · Colombia",
    isDemo: h.isDemo,
  };
}

/** Mismo esqueleto que el contenido real (hero a 9 columnas) para no provocar desplazamientos al llegar los datos. */
function HomeSkeleton() {
  return (
    <div className="wrap pt-5 md:pt-6" aria-busy="true" aria-label="Cargando portada">
      <div className="grid12 gap-y-6">
        <div className="col-span-12 xl:col-span-9">
          <div className="hero" />
        </div>
      </div>
    </div>
  );
}

/** Título y descripción de la portada: salen de los ajustes del sitio (si no se pueden leer, los textos originales). */
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  let settings = DEFAULT_SITE_SETTINGS;
  try {
    settings = await getSiteSettings(await getDb());
  } catch (error) {
    console.error("[metadata] no se pudieron leer los ajustes", error);
  }
  const { name, tagline, description } = settings.site;
  // «StereoFace — electrónica, …»: la bajada va en minúscula tras la raya, como siempre.
  const tail = tagline ? ` — ${tagline.charAt(0).toLowerCase()}${tagline.slice(1)}` : "";
  return { title: `${name}${tail}`, description };
}

async function HomeContent() {
  // Los datos dependen de la base de datos en cada petición: se excluyen del prerenderizado.
  await connection();
  const now = new Date();
  const db = await getDb();
  const [data, settings] = await Promise.all([getHomeData(db, now), getSiteSettings(db).catch(() => DEFAULT_SITE_SETTINGS)]);
  const hasDemo = [...data.hero, ...data.features, ...data.recent, ...data.latest].some((s) => s.isDemo);
  // Si aún no se han configurado destacados, la portada no queda vacía: muestra las últimas publicaciones.
  const heroSlides = (data.hero.length ? data.hero : data.recent).map(heroView);
  const lead = data.latest[0];

  if (data.hero.length === 0 && data.latest.length === 0 && data.recent.length === 0) {
    return (
      <div className="wrap py-24">
        <h1 className="display t-l">
          {process.env.NODE_ENV === "production" ? "Próximamente" : "Aún no hay contenido"}
        </h1>
        <p className="muted mt-4 max-w-[52ch]">
          {process.env.NODE_ENV === "production" ? (
            "Estamos preparando la primera edición de StereoFace."
          ) : (
            <>
              La base de datos está vacía. En desarrollo ejecuta <code className="mono">npm run db:seed</code> para
              cargar el contenido de demostración, o publica artículos desde el administrador.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">StereoFace: música electrónica, indie y cultura underground</h1>
      <MotionReady />

      {/* HERO + LO MÁS RECIENTE */}
      <div className="wrap pt-5 md:pt-6">
        <div className="grid12 gap-y-6">
          <div className="col-span-12 xl:col-span-9">{heroSlides.length > 0 && <HeroSlider slides={heroSlides} />}</div>

          <aside aria-labelledby="reciente" className="col-span-12 xl:col-span-3">
            <h2 id="reciente" className="display-up flex items-center gap-3 border-b border-line pb-3 text-[1.15rem]">
              <span aria-hidden="true" className="live-dot" />
              Lo más reciente
            </h2>
            <ul className="grid gap-x-6 md:grid-cols-3 xl:block">
              {data.recent.map((s, i) => {
                const a = s.coverArt ?? FALLBACK_ART;
                return (
                  <li
                    key={s.id}
                    className="hover-host grid grid-cols-[6.2rem_1fr] gap-4 border-b border-line py-4"
                    data-reveal
                    data-delay={0.1 * i}
                  >
                    <ArticleCover
                      s={s}
                      ratio="1"
                      className="transition-transform duration-700 ease-[cubic-bezier(.2,.8,.2,1)] [.hover-host:hover_&]:scale-105"
                    />
                    <div className="flex min-w-0 flex-col justify-between gap-1">
                      <p className="mono" style={{ color: inkFor(a.tone) }}>
                        {s.kicker ?? s.categoryName}
                      </p>
                      <h3 className="text-[1rem] font-semibold leading-[1.2]">
                        <Link href={`/noticias/${s.slug}`} className="stretch">
                          <span className="sweep">{s.title}</span>
                        </Link>
                      </h3>
                      <p className="mono muted flex items-center justify-between">
                        <span>{timeAgoEs(s.publishedAt, now)}</span>
                        <span aria-hidden="true" className="text-accent-ink">
                          →
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      </div>

      {/* RIEL DE CATEGORÍAS: anclas reales a las secciones de esta página */}
      <nav aria-label="Categorías" className="wrap mt-6">
        <Rail items={RAIL} />
      </nav>

      {/* DESTACADOS */}
      <section id="destacados" aria-label="Destacados" className="wrap mt-6 scroll-mt-24">
        <ul className="grid12 gap-y-4">
          {data.features.map((f, i) => {
            const a = f.coverArt ?? FALLBACK_ART;
            return (
              <li key={f.id} className="col-span-12 sm:col-span-6 lg:col-span-3" data-reveal data-delay={i * 0.08}>
                <article className="feat hover-host" style={{ ["--cover" as string]: TONES[a.tone].a }}>
                  <div className="art">
                    {f.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto de la nota (propia o de la fuente citada)
                      <img
                        src={f.coverUrl}
                        alt={f.coverAlt ?? ""}
                        className="size-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    ) : (
                      <Art scene={a.scene} tone={a.tone} seed={a.seed} />
                    )}
                  </div>
                  {f.isDemo && <span className="tag tag-demo absolute left-3 top-3 z-[2]">Demo</span>}
                  <div className="cap">
                    <div>
                      <p className="mono" style={{ color: "var(--cover)" }}>
                        {f.kicker}
                      </p>
                      <h3 className="mt-1 text-[1.35rem] font-bold leading-[1.1]">
                        <Link href={`/noticias/${f.slug}`} className="stretch">
                          <span className="sweep">{f.title}</span>
                        </Link>
                      </h3>
                    </div>
                    <span className="arrow shrink-0" aria-hidden="true">
                      →
                    </span>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </section>

      {/* TICKER */}
      {data.sections.length > 0 && (
        <div className="mt-16 bg-accent text-on-accent" aria-label="Secciones">
          <Ticker className="display py-3 text-[1.5rem]" items={data.sections} />
        </div>
      )}

      {/* ÚLTIMA HORA */}
      {lead && (
        <>
          <div className="mt-24" />
          <SectionHead n="01" label="Última hora" id="noticias">
            <span className="mono muted">Orden cronológico</span>
          </SectionHead>
          <section aria-label="Últimas noticias" className="wrap">
            <div className="grid12 gap-y-12">
              <article className="hover-host col-span-12 lg:col-span-6" data-reveal>
                <Thumb s={lead} ratio="4 / 3" />
                <div className="mt-4">
                  <Meta s={lead} />
                  <h3 className="display t-l mt-3">
                    <Link href={`/noticias/${lead.slug}`} className="stretch">
                      <span className="sweep">{lead.title}</span>
                    </Link>
                  </h3>
                  {lead.dek && <p className="muted mt-3 max-w-[48ch]">{lead.dek}</p>}
                </div>
              </article>

              <div className="col-span-12 flex flex-col gap-10 sm:col-span-6 lg:col-span-3">
                {data.latest.slice(1, 3).map((s, i) => (
                  <article key={s.id} className="hover-host" data-reveal data-delay={0.08 * (i + 1)}>
                    <Thumb s={s} ratio="5 / 4" />
                    <div className="mt-3">
                      <Meta s={s} />
                      <h3 className="mt-2 text-[1.3rem] font-bold leading-[1.12]">
                        <Link href={`/noticias/${s.slug}`} className="stretch">
                          <span className="sweep">{s.title}</span>
                        </Link>
                      </h3>
                    </div>
                  </article>
                ))}
              </div>

              <div className="col-span-12 sm:col-span-6 lg:col-span-3">
                <p className="mono muted pb-2">Más / sin imagen</p>
                <ul>
                  {data.latest.slice(3, 5).map((s) => (
                    <li key={s.id} className="hover-host border-t border-line py-4" data-reveal>
                      <Meta s={s} />
                      <h3 className="mt-2 text-[1.15rem] font-semibold leading-[1.15]">
                        <Link href={`/noticias/${s.slug}`} className="stretch">
                          <span className="sweep">{s.title}</span>
                        </Link>
                      </h3>
                    </li>
                  ))}
                  <li className="mono border-t border-line py-4 text-muted">
                    El archivo completo llega con la ruta /noticias
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}

      {/* ELECTRÓNICA | INDIE — dos canales */}
      <div className="mt-28" />
      <section aria-label="Electrónica e Indie" className="grid grid-cols-1 lg:grid-cols-2">
        <div
          id="electronica"
          className="scroll-mt-16 bg-[#0d1204] px-[var(--gutter)] py-14 text-[#f2f2ee] lg:pl-[max(var(--gutter),calc((100vw-var(--max))/2+var(--gutter)))]"
        >
          <p className="mono flex justify-between">
            <span className="tag" style={{ color: TONES.acid.a }}>
              Canal L
            </span>
            <span className="opacity-60">02 / Electrónica</span>
          </p>
          <h2 className="display t-l mt-8" style={{ color: TONES.acid.a }}>
            <Mask>Electrónica</Mask>
          </h2>
          <ul className="mt-10">
            {data.electronica.map((s) => (
              <li
                key={s.id}
                className="hover-host grid grid-cols-[1fr_auto] items-baseline gap-4 border-t border-white/15 py-4"
                data-reveal
              >
                <div>
                  <p className="mono opacity-60">{s.kicker}</p>
                  <h3 className="text-[1.3rem] font-bold leading-[1.1]">
                    <Link href={`/noticias/${s.slug}`} className="stretch">
                      <span className="sweep">{s.title}</span>
                    </Link>
                  </h3>
                </div>
                <span className="mono opacity-60">{formatDayMonth(s.publishedAt)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          id="indie"
          className="scroll-mt-16 bg-[#120a24] px-[var(--gutter)] py-14 text-[#f2f2ee] lg:pr-[max(var(--gutter),calc((100vw-var(--max))/2+var(--gutter)))]"
        >
          <p className="mono flex justify-between">
            <span className="opacity-60">03 / Indie</span>
            <span className="tag" style={{ color: TONES.violet.a }}>
              Canal R
            </span>
          </p>
          <h2 className="display t-l mt-8 lg:text-right" style={{ color: TONES.violet.a }}>
            <Mask>Indie</Mask>
          </h2>
          <ul className="mt-10">
            {data.indie.map((s) => (
              <li
                key={s.id}
                className="hover-host grid grid-cols-[auto_1fr] items-baseline gap-4 border-t border-white/15 py-4"
                data-reveal
              >
                <span className="mono opacity-60">{formatDayMonth(s.publishedAt)}</span>
                <div>
                  <p className="mono opacity-60">{s.kicker}</p>
                  <h3 className="text-[1.3rem] font-bold leading-[1.1]">
                    <Link href={`/noticias/${s.slug}`} className="stretch">
                      <span
                        className="sweep"
                        style={{ backgroundImage: `linear-gradient(${TONES.violet.a},${TONES.violet.a})` }}
                      >
                        {s.title}
                      </span>
                    </Link>
                  </h3>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ARTISTAS */}
      {data.artists.length > 0 && (
        <>
          <div className="mt-28" />
          <SectionHead n="04" label="Artistas destacados" id="artistas">
            <Link href="/artistas" className="mono hover:text-accent-ink">
              Ver todos →
            </Link>
          </SectionHead>
          <section aria-label="Artistas destacados" className="wrap">
            <h2 className="display t-xl">
              <Mask>Artistas</Mask>
            </h2>
            <ul className="grid12 mt-10 gap-y-10">
              {data.artists.map((a, i) => {
                const c = a.coverArt ?? FALLBACK_ART;
                return (
                  <li
                    key={a.id}
                    className={`stereo-host hover-host col-span-6 lg:col-span-3 ${i % 2 ? "lg:mt-20" : ""}`}
                    data-reveal
                    data-delay={i * 0.08}
                  >
                    <div className="relative">
                      <StereoImage ratio="3 / 4">
                        {a.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- foto propia servida por /media
                          <img src={a.imageUrl} alt={a.name} className="size-full object-cover" />
                        ) : (
                          <Art scene={c.scene} tone={c.tone} seed={c.seed} />
                        )}
                      </StereoImage>
                      {a.isDemo && <span className="tag tag-demo absolute left-2 top-2 z-10">Demo</span>}
                      {a.country && <span className="tag tag-fill absolute bottom-2 left-2 z-10">{a.country}</span>}
                    </div>
                    <h3 className="display-up mt-3 text-[1.25rem]">
                      <Link href={`/artistas/${a.slug}`} className="stretch">
                        <span className="sweep">{a.name}</span>
                      </Link>
                    </h3>
                    <p className="mono muted">{a.genre}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {/* LANZAMIENTOS */}
      <div className="mt-28" />
      <SectionHead n="05" label="Nuevos lanzamientos" id="lanzamientos" />
      <section aria-label="Nuevos lanzamientos" className="wrap">
        <div className="grid12 gap-y-8">
          <div className="col-span-12 lg:col-span-5">
            <h2 className="display text-[clamp(2rem,3.7vw,4.4rem)]">
              <Mask>Nuevos</Mask>
              <Mask className="text-accent-ink">lanzamientos</Mask>
            </h2>
            <p className="muted mt-6 max-w-[36ch]">
              Álbumes, EP, singles, remixes, sets y podcasts. Los reproductores oficiales se incrustan; nunca alojamos
              música sin autorización.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-7">
            <div className="mono muted grid grid-cols-[5rem_1fr_auto] gap-3 pb-2">
              <span>Tipo</span>
              <span>Artista — Título</span>
              <span>Fecha</span>
            </div>
            {data.releases.length === 0 && (
              <p className="muted border-t border-line py-6">Aún no hay lanzamientos publicados.</p>
            )}
            <ul>
              {data.releases.map((r) => (
                <li key={r.id} className="spec-row !grid-cols-[5rem_1fr_auto]" data-reveal>
                  <span className="tag w-fit">{RELEASE_KIND_LABEL[r.kind]}</span>
                  <span>
                    <span className="display-up block text-[1.2rem]">{r.artistNames.join(", ")}</span>
                    <span className="muted">
                      {r.title}{" "}
                      {r.label && (
                        <>
                          · <span className="mono">{r.label}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="mono">{formatDayMonth(r.releasedAt)}</span>
                </li>
              ))}
            </ul>
            <div className="mono flex items-end justify-between border-t border-fg pt-3">
              <span>
                Total <span data-count-to={data.releases.length}>{String(data.releases.length).padStart(2, "0")}</span>{" "}
                entradas
              </span>
              <Barcode value="lanzamientos" className="h-8 w-28" />
            </div>
          </div>
        </div>
      </section>

      {/* AGENDA */}
      <div className="mt-28" />
      <SectionHead n="06" label="Agenda" id="agenda" />
      <section aria-label="Agenda de eventos" className="wrap">
        <div className="grid12 gap-y-8">
          <div className="order-2 col-span-12 lg:order-1 lg:col-span-7">
            <ul>
              {data.events.map((e, i) => (
                <li key={e.id} className="spec-row" data-reveal>
                  <span className="mono muted">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <span className="display-up block text-[1.6rem]">{e.city}</span>
                    <span className="mono muted">
                      {e.country} · {e.name}
                      {e.genre ? ` · ${e.genre}` : ""}
                    </span>
                  </span>
                  <span className="display-cond text-[2rem] text-accent-ink">{formatAgendaDate(e.startsAt)}</span>
                </li>
              ))}
            </ul>
            <p className="mono mt-3 flex justify-between border-t border-fg pt-3">
              <span>
                Total <span data-count-to={data.events.length}>{String(data.events.length).padStart(2, "0")}</span>{" "}
                fechas
              </span>
              <span className="muted">Filtros por país, ciudad y género: ruta /agenda</span>
            </p>
          </div>
          <div className="order-1 col-span-12 lg:order-2 lg:col-span-5 lg:pl-10">
            <h2 className="display text-[clamp(2rem,3.7vw,4.4rem)]">
              <Mask>Agenda</Mask>
              <Mask className="text-accent-ink">Col / Latam</Mask>
            </h2>
            <p className="muted mt-6 max-w-[38ch]">
              Festivales, conciertos, raves y fechas de gira con ubicación, artistas y enlace oficial de entradas.
            </p>
          </div>
        </div>
      </section>

      {/* SELECCIÓN DEL EDITOR */}
      <div className="mt-28" />
      <section id="editor" aria-label="Selección del editor" className="scroll-mt-16 border-y border-line">
        <div className="wrap py-16 md:py-24">
          <p className="mono flex justify-between">
            <span className="tag tag-fill">Selección del editor</span>
            <span className="muted">Entrevista{hasDemo ? " · demo" : ""}</span>
          </p>
          <blockquote className="mt-10">
            <p
              className="display leading-[1.02]"
              style={{ fontSize: "clamp(2rem, 5.2vw, 5.8rem)", textTransform: "none", fontWeight: 800 }}
              data-reveal
            >
              «La música no solo suena: abre grietas, reúne cuerpos y cambia la noche.»
            </p>
          </blockquote>
        </div>
      </section>

      {/* CULTURA UNDERGROUND */}
      <section id="cultura" aria-label="Cultura underground" className="wrap mt-24 scroll-mt-16">
        <div className="grid12 gap-y-8">
          <h2 className="display col-span-12 text-[clamp(2.4rem,6.2vw,7.4rem)] lg:col-span-7">
            <Mask>Cultura</Mask>
            <Mask className="text-accent-ink">underground</Mask>
          </h2>
          <ul className="col-span-12 self-end lg:col-span-5">
            {data.latest.slice(3, 5).map((s) => (
              <li key={s.id} className="hover-host border-t border-line py-4" data-reveal>
                <Meta s={s} />
                <h3 className="mt-2 text-[1.3rem] font-bold leading-[1.1]">
                  <Link href={`/noticias/${s.slug}`} className="stretch">
                    <span className="sweep">{s.title}</span>
                  </Link>
                </h3>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* NEWSLETTER */}
      <section aria-label="Newsletter" className="wrap mt-28">
        <div className="panel grid12 items-center gap-y-6 p-6 md:p-10">
          <h2 className="display t-l col-span-12 lg:col-span-6">{settings.newsletter.title}</h2>
          <div className="col-span-12 lg:col-span-6">
            <p className="max-w-[40ch]">{settings.newsletter.text}</p>
            <NewsletterForm />
          </div>
        </div>
      </section>
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}
