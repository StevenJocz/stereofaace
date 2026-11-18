"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contrast, mix } from "@/modules/spaces/design";
import type { MySpace } from "@/modules/spaces/profile";
import type { PublicSpace } from "@/modules/spaces/public";
import { ResendButton } from "./AuthForms";
import { BlocksPanel, DesignPanel, GenresPanel, IdentityPanel, ImagesPanel, L, MusicPanel, PrivacyPanel, Section, ThemesPanel, type Studio } from "./SpacePanels";
import { SpaceView } from "./SpaceView";

type Save = "idle" | "saving" | "saved" | "error";
type Tab = "identidad" | "musica" | "diseno" | "bloques" | "imagenes" | "privacidad";

async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: isForm || body === undefined ? undefined : { "content-type": "application/json" },
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error("No se pudo conectar. Revisa tu conexión.");
  }
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(res.status === 401 ? "Tu sesión expiró. Vuelve a entrar." : (data?.error ?? "No se pudo guardar."));
  return data as T;
}

const profilePayload = (p: MySpace["profile"]) => ({ displayName: p.displayName, bio: p.bio ?? "", location: p.location ?? "", tagline: p.tagline ?? "", links: p.links, privacy: p.privacy });

/**
 * Editor y asistente de creación de un Space. El estado local se guarda solo (borrador) y la vista previa es el mismo
 * componente que ve el público, alimentado por ese estado. Todo pasa por las rutas /api/spaces/me: no hay identificadores
 * de otras personas en ninguna llamada, así que cada quien solo puede cambiar lo suyo.
 */
export function SpaceStudio({ initial, mode, mailConfigured, logout }: { initial: MySpace; mode: "wizard" | "editor"; mailConfigured: boolean; logout: () => Promise<void> }) {
  const router = useRouter();
  const [space, setSpace] = useState(initial);
  const [tab, setTab] = useState<Tab>("identidad");
  const [step, setStep] = useState(1);
  const [save, setSave] = useState<Save>("idle");
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const skip = useRef({ design: true, profile: true });
  const { profile, design } = space;

  const run = useCallback(async (work: () => Promise<void>) => {
    setSave("saving");
    setError(null);
    try {
      await work();
      setSave("saved");
    } catch (e) {
      setSave("error");
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }, []);
  const reload = useCallback(async () => setSpace(await api<MySpace>("GET", "/api/spaces/me")), []);

  const lowContrast = contrast(design.colors.text, mix(design.colors.card, design.colors.bg, design.cardOpacity / 100)) < 4.5;

  // Autoguardado del borrador del diseño: espera a que se deje de tocar y no guarda un diseño ilegible.
  useEffect(() => {
    if (skip.current.design) {
      skip.current.design = false;
      return;
    }
    if (lowContrast) return;
    const t = setTimeout(() => void run(async () => void (await api("PUT", "/api/spaces/me/design", design))), 900);
    return () => clearTimeout(t);
  }, [design, lowContrast, run]);

  const profileKey = JSON.stringify(profilePayload(profile));
  useEffect(() => {
    if (skip.current.profile) {
      skip.current.profile = false;
      return;
    }
    const t = setTimeout(() => void run(async () => void (await api("PUT", "/api/spaces/me/profile", JSON.parse(profileKey)))), 900);
    return () => clearTimeout(t);
  }, [profileKey, run]);

  const setDesign: Studio["setDesign"] = (patch) => setSpace((s) => ({ ...s, design: patch(s.design), dirty: true }));
  const setProfile: Studio["setProfile"] = (patch) => setSpace((s) => ({ ...s, profile: { ...s.profile, ...patch }, dirty: true }));

  const studio: Studio = {
    space,
    design,
    profile,
    lowContrast,
    setDesign,
    setProfile,
    logout,
    applyTheme: (slug) => {
      const t = space.options.themes.find((x) => x.slug === slug);
      if (t) setDesign((d) => ({ ...t.design, player: d.player, quote: d.quote, musicinfo: d.musicinfo, blocks: d.blocks }));
    },
    saveGenres: (slugs) => {
      setSpace((s) => ({ ...s, genres: slugs }));
      void run(async () => void (await api("PUT", "/api/spaces/me/genres", { genres: slugs })));
    },
    saveArtists: (list) => {
      setSpace((s) => ({ ...s, artists: list }));
      void run(async () => void (await api("PUT", "/api/spaces/me/artists", { artists: list })));
    },
    upload: (kind, file) => {
      if (!file) return;
      void run(async () => {
        const form = new FormData();
        form.set("kind", kind);
        form.set("file", file);
        const r = await api<{ id: string }>("POST", "/api/spaces/me/assets", form);
        await reload();
        if (kind === "background") setDesign((d) => ({ ...d, background: { ...d.background, kind: "image", assetId: r.id } }));
      });
    },
    removeImage: (id) =>
      void run(async () => {
        await api("DELETE", `/api/spaces/me/assets?id=${id}`);
        await reload();
      }),
    changeUsername: (value) =>
      void run(async () => {
        const r = await api<{ username: string }>("PUT", "/api/spaces/me/username", { username: value });
        setProfile({ username: r.username });
      }),
  };

  const preview: PublicSpace = useMemo(() => {
    const p = space.profile;
    const bg = space.assets.find((a) => a.id === space.design.background.assetId);
    return {
      username: p.username,
      displayName: p.displayName,
      tagline: p.tagline,
      bio: p.bio,
      location: p.privacy.showLocation ? p.location : null,
      joinedAt: p.privacy.showJoined ? p.joinedAt : null,
      links: p.privacy.showLinks ? p.links : {},
      genres: space.genres.map((slug) => ({ slug, name: space.options.genres.find((g) => g.slug === slug)?.name ?? slug })),
      artists: p.privacy.showFavorites ? space.artists.map((a) => ({ name: a.name, slug: null, imageUrl: null })) : [],
      gallery: space.assets.filter((a) => a.kind === "gallery").map((a) => ({ url: a.url, alt: a.alt })),
      avatarUrl: space.avatarUrl,
      coverUrl: space.coverUrl,
      backgroundUrl: bg?.url ?? null,
      design: space.design,
      featured: p.featured,
      listed: p.privacy.listed,
      isOwner: true,
      isDraftPreview: true,
    };
  }, [space]);

  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      // Antes de publicar se guarda lo último que hay en pantalla.
      await api("PUT", "/api/spaces/me/design", design);
      await api("PUT", "/api/spaces/me/profile", profilePayload(profile));
      await api("POST", "/api/spaces/me/publish");
      await reload();
      setSave("saved");
      if (mode === "wizard") router.push(`/@${profile.username}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo publicar.");
    } finally {
      setBusy(false);
    }
  };
  const unpublish = async () => {
    setBusy(true);
    try {
      await api("DELETE", "/api/spaces/me/publish");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo despublicar.");
    } finally {
      setBusy(false);
    }
  };

  const status = profile.status === "disabled" ? "Desactivado" : profile.status === "published" ? (space.dirty ? "Publicado · con cambios sin publicar" : "Publicado") : "Borrador";
  const saveLabel = save === "saving" ? "Guardando…" : save === "saved" ? "Guardado ✓" : save === "error" ? "No se guardó" : "";
  const needsVerify = mailConfigured && !profile.verified;

  const topBar = (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <div>
        <p className="mono text-accent-ink">StereoFace Spaces</p>
        <p className="display-up text-[1.3rem] leading-none">@{profile.username}</p>
        <p className="mono muted mt-1 text-[0.72rem]">
          {status} {saveLabel && <span aria-live="polite">· {saveLabel}</span>}
        </p>
      </div>
      {mode === "editor" && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/@${profile.username}?vista=borrador`} className="btn !px-4 !py-2" target="_blank">
            Ver mi Space
          </Link>
          {profile.status === "published" && (
            <button type="button" className="btn !px-4 !py-2" disabled={busy} onClick={() => void unpublish()}>
              Despublicar
            </button>
          )}
          <button type="button" className="btn btn-accent !px-4 !py-2" disabled={busy || profile.status === "disabled" || lowContrast || needsVerify} onClick={() => void publish()}>
            {profile.status === "published" ? "Publicar cambios" : "Publicar"}
          </button>
        </div>
      )}
    </header>
  );

  const messages = (
    <div className="grid gap-2" aria-live="polite">
      {error && (
        <p role="alert" className="mono text-[#ff8a8a] text-[0.8rem]">
          {error}
        </p>
      )}
      {needsVerify && (
        <div className="panel p-3">
          <p className="mono text-[0.78rem]">Confirma tu correo para poder publicar. Te enviamos un enlace al registrarte.</p>
          <div className="mt-2">
            <ResendButton />
          </div>
        </div>
      )}
      {profile.status === "disabled" && (
        <p role="alert" className="mono text-[#ff8a8a] text-[0.8rem]">
          Tu Space fue desactivado por incumplir las normas de StereoFace.
        </p>
      )}
    </div>
  );

  /* ───────── asistente de creación ───────── */
  if (mode === "wizard") {
    const steps = ["Usuario", "Géneros", "Plantilla", "Foto y bio", "Publicar"];
    return (
      <div className="wrap py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          {topBar}
          <ol className="mt-5 flex gap-1" aria-label="Pasos">
            {steps.map((s, i) => (
              <li key={s} className={`h-1.5 flex-1 rounded-full ${i + 1 <= step ? "bg-accent" : "bg-line"}`} aria-current={i + 1 === step ? "step" : undefined} title={s} />
            ))}
          </ol>
          <p className="mono muted mt-2">
            Paso {step} de 5 · {steps[step - 1]}
          </p>
          <div className="mt-5 grid gap-5">
            {step === 1 && (
              <>
                <h1 className="display-up text-[2rem] leading-none">Elige tu nombre</h1>
                <p className="muted">Será tu dirección: stereoface.online/@{profile.username}</p>
                <Section title="Identidad">
                  <L label="Nombre de usuario">
                    <input className="input" defaultValue={profile.username} maxLength={20} autoCapitalize="none" onBlur={(e) => e.target.value !== profile.username && studio.changeUsername(e.target.value)} />
                  </L>
                  <L label="Nombre visible">
                    <input className="input" value={profile.displayName} maxLength={40} onChange={(e) => setProfile({ displayName: e.target.value })} />
                  </L>
                </Section>
              </>
            )}
            {step === 2 && (
              <>
                <h1 className="display-up text-[2rem] leading-none">¿Qué suena en tu cabeza?</h1>
                <GenresPanel s={studio} />
              </>
            )}
            {step === 3 && (
              <>
                <h1 className="display-up text-[2rem] leading-none">Elige tu estilo</h1>
                <ThemesPanel s={studio} />
                <div className="space-frame">
                  <SpaceView space={preview} preview />
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <h1 className="display-up text-[2rem] leading-none">Tu cara y tu historia</h1>
                <p className="muted">Todo es opcional: puedes completarlo después.</p>
                <ImagesPanel s={studio} />
                <Section title="Sobre ti">
                  <L label="Biografía">
                    <textarea className="input min-h-[6rem]" value={profile.bio ?? ""} maxLength={500} onChange={(e) => setProfile({ bio: e.target.value })} />
                  </L>
                  <L label="Frase personal">
                    <input className="input" value={profile.tagline ?? ""} maxLength={120} onChange={(e) => setProfile({ tagline: e.target.value })} />
                  </L>
                </Section>
              </>
            )}
            {step === 5 && (
              <>
                <h1 className="display-up text-[2rem] leading-none">Tu Space está listo</h1>
                <div className="space-frame">
                  <SpaceView space={preview} preview />
                </div>
                <p className="muted">Puedes cambiar todo cuando quieras desde «Editar mi Space».</p>
              </>
            )}
            {messages}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" className="btn" disabled={step === 1} onClick={() => setStep(step - 1)}>
                ← Atrás
              </button>
              {step < 5 ? (
                <div className="flex gap-2">
                  {step >= 2 && (
                    <button type="button" className="btn" onClick={() => setStep(step + 1)}>
                      Omitir
                    </button>
                  )}
                  <button type="button" className="btn btn-accent" onClick={() => setStep(step + 1)}>
                    Siguiente →
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link href="/spaces/editar" className="btn">
                    Publicar más tarde
                  </Link>
                  <button type="button" className="btn btn-accent" disabled={busy || needsVerify} onClick={() => void publish()}>
                    Publicar mi Space
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ───────── editor completo ───────── */
  const tabs: [Tab, string][] = [["identidad", "Identidad"], ["musica", "Música"], ["diseno", "Diseño"], ["bloques", "Bloques"], ["imagenes", "Imágenes"], ["privacidad", "Privacidad"]];
  return (
    <div className="wrap py-6">
      {topBar}
      <div className="mt-4">{messages}</div>
      <div className="studio-editor mt-4">
        <section aria-label="Controles" className={`studio-controls ${showPreview ? "hidden lg:block" : ""}`}>
          <div role="tablist" aria-label="Secciones del editor" className="studio-tabs">
            {tabs.map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="studio-tab" onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-5">
            {tab === "identidad" && <IdentityPanel s={studio} />}
            {tab === "musica" && <MusicPanel s={studio} />}
            {tab === "diseno" && <DesignPanel s={studio} />}
            {tab === "bloques" && <BlocksPanel s={studio} />}
            {tab === "imagenes" && <ImagesPanel s={studio} />}
            {tab === "privacidad" && <PrivacyPanel s={studio} />}
          </div>
        </section>
        <section aria-label="Vista previa" className={showPreview ? "" : "hidden lg:block"}>
          <div className="space-frame">
            <SpaceView space={preview} preview />
          </div>
        </section>
      </div>
      <button type="button" className="btn btn-accent fixed bottom-24 right-4 z-40 lg:hidden" onClick={() => setShowPreview(!showPreview)}>
        {showPreview ? "Volver a editar" : "Ver vista previa"}
      </button>
    </div>
  );
}
