"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { JSONContent } from "@tiptap/react";
import {
  deleteArticleAction,
  facebookPostNowAction,
  previewAction,
  restoreRevisionAction,
  saveArticleAction,
  statusAction,
  type SaveResult,
} from "@/app/(admin)/admin/(panel)/articulos/actions";
import { SCENES, TONES, type CoverArt } from "@/modules/media/cover-art";
import type { ArticleState } from "@/modules/content/schema";
import { ArtistPicker } from "./ArtistPicker";
import { MediaUpload } from "./MediaUpload";
import { TiptapEditor, type EditorValue } from "./TiptapEditor";

export type EditorArticle = {
  id: string;
  title: string;
  slug: string;
  kicker: string;
  dek: string;
  categoryId: string;
  status: ArticleState;
  scheduledFor: string;
  layout: "standard" | "special";
  authorName: string;
  coverUrl: string;
  coverAlt: string;
  coverCredit: string;
  coverArt: CoverArt | null;
  seoTitle: string;
  seoDescription: string;
  noindex: boolean;
  tags: string[];
  artistIds: string[];
  references: { title: string; url: string; outlet?: string }[];
  bodyJson: JSONContent | null;
  bodyHtml: string;
  updatedAt: string;
  isDemo: boolean;
};

type Revision = { id: string; title: string; createdAt: string; authorName: string };

const STATUS_LABEL: Record<ArticleState, string> = {
  draft: "Borrador",
  review: "En revisión",
  scheduled: "Programado",
  published: "Publicado",
  archived: "Archivado",
};

const refsToText = (r: EditorArticle["references"]) =>
  r.map((x) => [x.title, x.url, x.outlet].filter(Boolean).join(" | ")).join("\n");

function parseRefs(text: string): { title: string; url: string; outlet?: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [title, url, outlet] = l.split("|").map((x) => x.trim());
      return { title, url, ...(outlet ? { outlet } : {}) };
    });
}

const toLocalInput = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="panel p-4">
      <h2 id={id} className="mono mb-3 text-accent-ink">
        {title}
      </h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function L({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mono mb-1 block text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[0.75rem] text-muted">{hint}</p>}
    </div>
  );
}

export function ArticleEditor({
  article,
  categories,
  artistOptions,
  revisions,
  canEdit,
  canPublish,
  canDelete,
  facebook = null,
}: {
  article: EditorArticle;
  categories: { id: string; name: string }[];
  /** Artistas y bandas que se pueden etiquetar en la nota. */
  artistOptions: { id: string; name: string }[];
  revisions: Revision[];
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
  /** Estado en Facebook (null si no está activado o no hay permiso). */
  facebook?: { status: string | null; error: string | null } | null;
}) {
  const [fbMsg, setFbMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [fbBusy, setFbBusy] = useState(false);
  const [f, setF] = useState({
    title: article.title,
    slug: article.slug,
    kicker: article.kicker,
    dek: article.dek,
    categoryId: article.categoryId,
    layout: article.layout,
    authorName: article.authorName,
    coverUrl: article.coverUrl,
    coverAlt: article.coverAlt,
    coverCredit: article.coverCredit,
    useArt: !!article.coverArt,
    art: article.coverArt ?? ({ scene: "wave", tone: "acid", seed: 7 } as CoverArt),
    seoTitle: article.seoTitle,
    seoDescription: article.seoDescription,
    noindex: article.noindex,
    tags: article.tags.join(", "),
    artistIds: article.artistIds,
    refs: refsToText(article.references),
  });
  const [body, setBody] = useState<EditorValue>({
    json: article.bodyJson ?? { type: "doc", content: [] },
    html: article.bodyHtml,
  });
  const [status, setStatus] = useState<ArticleState>(article.status);
  const [when, setWhen] = useState(toLocalInput(article.scheduledFor));
  const [version, setVersion] = useState(article.updatedAt);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const saving = useRef(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const autosaveOk = canEdit && (status === "draft" || status === "review");

  const payload = useCallback(
    (over: { status?: ArticleState; scheduledFor?: string } = {}) => {
      const st = over.status ?? status;
      const sched = over.scheduledFor ?? when;
      const opt = (v: string) => (v.trim() ? v.trim() : undefined);
      return {
        title: f.title,
        slug: opt(f.slug),
        kicker: opt(f.kicker),
        dek: opt(f.dek),
        bodyJson: body.json,
        bodyHtml: body.html,
        categoryId: opt(f.categoryId),
        status: st,
        scheduledFor: st === "scheduled" && sched ? new Date(sched).toISOString() : undefined,
        layout: f.layout,
        coverArt: f.useArt ? f.art : undefined,
        coverUrl: opt(f.coverUrl),
        coverAlt: opt(f.coverAlt),
        coverCredit: opt(f.coverCredit),
        seo: { title: opt(f.seoTitle), description: opt(f.seoDescription), noindex: f.noindex || undefined },
        authorName: opt(f.authorName),
        tags: f.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        artistIds: f.artistIds,
        references: parseRefs(f.refs),
        expectedUpdatedAt: version,
      };
    },
    [f, body, status, when, version],
  );

  const handle = useCallback((r: SaveResult, okText: string) => {
    if (r.ok) {
      setVersion(r.updatedAt);
      setErrors({});
      setMsg({ kind: "ok", text: okText });
      return true;
    }
    setErrors(r.errors ?? {});
    setMsg({ kind: "err", text: r.code === "conflict" ? `${r.message}` : r.message });
    return false;
  }, []);

  const save = useCallback(
    async (okText = "Guardado") => {
      if (saving.current) return false;
      saving.current = true;
      try {
        const r = await saveArticleAction(article.id, payload());
        const ok = handle(
          r,
          `${okText} ${new Date().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`,
        );
        if (ok) setDirty(false);
        return ok;
      } finally {
        saving.current = false;
      }
    },
    [article.id, payload, handle],
  );

  // Guardado automático (solo borradores y revisiones; en publicados se guarda a mano).
  useEffect(() => {
    if (!dirty || !autosaveOk) return;
    const t = window.setTimeout(() => void save("Guardado automático"), 2500);
    return () => window.clearTimeout(t);
  }, [dirty, autosaveOk, save, f, body]);

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function changeStatus(next: ArticleState) {
    if (next === "scheduled" && !when) {
      setMsg({ kind: "err", text: "Elige la fecha y hora de publicación." });
      return;
    }
    if (dirty && !(await save("Guardado"))) return;
    const r = await statusAction(article.id, next, next === "scheduled" ? new Date(when).toISOString() : undefined);
    if (handle(r, `Estado: ${STATUS_LABEL[next]}`)) setStatus(next);
  }

  async function openPreview() {
    setPreview(await previewAction(body.html));
  }

  const seoTitleShown = f.seoTitle || f.title;
  const disabled = !canEdit;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`badge ${status === "published" ? "badge-ok" : status === "draft" || status === "archived" ? "badge-idle" : "badge-warn"}`}
        >
          {STATUS_LABEL[status]}
        </span>
        {article.isDemo && <span className="tag tag-demo">Demo</span>}
        <p className="mono text-muted" role="status" aria-live="polite">
          {msg ? (
            <span className={msg.kind === "err" ? "text-[#ff8a8a]" : msg.kind === "ok" ? "text-accent-ink" : ""}>
              {msg.text}
            </span>
          ) : dirty ? (
            "Cambios sin guardar"
          ) : (
            "Todo guardado"
          )}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className="btn !px-4 !py-2" onClick={openPreview}>
            Vista previa
          </button>
          {disabled ? null : (
            <button
              type="button"
              className="btn btn-accent !px-4 !py-2"
              disabled={pending || !dirty}
              onClick={() => start(() => void save("Guardado"))}
            >
              {autosaveOk ? "Guardar ahora" : "Guardar cambios"}
            </button>
          )}
        </div>
      </div>
      {!autosaveOk && canEdit && (
        <p className="mono mt-2 text-[#ffb020]">
          Este artículo ya no es borrador: los cambios se publican al guardar (sin autoguardado).
        </p>
      )}
      {disabled && <p className="mono mt-2 text-muted">Solo lectura: tu rol no puede editar este artículo.</p>}

      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Columna principal */}
        <div className="min-w-0">
          <label htmlFor="title" className="sr-only">
            Título
          </label>
          <textarea
            id="title"
            rows={1}
            value={f.title}
            onChange={(e) => set("title", e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            disabled={disabled}
            maxLength={180}
            placeholder="Titular"
            aria-invalid={!!errors.title}
            style={{ fieldSizing: "content" } as React.CSSProperties}
            className="display w-full resize-none bg-transparent text-[clamp(1.8rem,3.4vw,3.2rem)] outline-none placeholder:opacity-30 focus-visible:outline-2"
          />
          {errors.title && (
            <p role="alert" className="mono text-[#ff8a8a]">
              {errors.title[0]}
            </p>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-[14rem_1fr]">
            <L id="kicker" label="Etiqueta (kicker)">
              <input
                id="kicker"
                className="input"
                value={f.kicker}
                maxLength={40}
                disabled={disabled}
                onChange={(e) => set("kicker", e.target.value)}
              />
            </L>
            <L id="dek" label="Bajada" hint={`${f.dek.length}/400`}>
              <textarea
                id="dek"
                className="input"
                value={f.dek}
                maxLength={400}
                disabled={disabled}
                onChange={(e) => set("dek", e.target.value)}
                style={{ minHeight: "3.5rem" }}
              />
            </L>
          </div>

          <div className="mt-5">
            <TiptapEditor
              initialJson={article.bodyJson}
              initialHtml={article.bodyHtml}
              disabled={disabled}
              onChange={(v) => {
                setBody(v);
                setDirty(true);
              }}
            />
          </div>
        </div>

        {/* Lateral */}
        <aside className="editor-side grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4" aria-label="Ajustes del artículo">
          <Section title="Publicación" id="s-pub">
            <div className="flex flex-wrap gap-2">
              {status === "draft" && canEdit && (
                <button type="button" className="btn !px-4 !py-2" onClick={() => changeStatus("review")}>
                  Enviar a revisión
                </button>
              )}
              {canPublish && status !== "published" && (
                <button type="button" className="btn btn-accent !px-4 !py-2" onClick={() => changeStatus("published")}>
                  Publicar ahora
                </button>
              )}
              {canPublish && status !== "draft" && (
                <button type="button" className="btn !px-4 !py-2" onClick={() => changeStatus("draft")}>
                  Volver a borrador
                </button>
              )}
              {canPublish && status !== "archived" && (
                <button type="button" className="btn !px-4 !py-2" onClick={() => changeStatus("archived")}>
                  Archivar
                </button>
              )}
            </div>
            {canPublish && (
              <div className="grid gap-2">
                <L id="when" label="Programar publicación" hint="Se vuelve público solo cuando llega la fecha.">
                  <input
                    id="when"
                    type="datetime-local"
                    className="input"
                    value={when}
                    onChange={(e) => {
                      setWhen(e.target.value);
                    }}
                  />
                </L>
                <button type="button" className="btn !px-4 !py-2 w-fit" onClick={() => changeStatus("scheduled")}>
                  Programar
                </button>
              </div>
            )}
            {status === "published" && (
              <a href={`/noticias/${f.slug}`} target="_blank" rel="noopener" className="mono text-accent-ink underline">
                Ver publicado ↗
              </a>
            )}
            {facebook && status === "published" && (
              <div className="grid gap-1.5 border-t border-line pt-3">
                <p className="mono text-muted">
                  Facebook:{" "}
                  {fbMsg ? <span className={fbMsg.ok ? "text-accent-ink" : "text-[#ff8a8a]"}>{fbMsg.message}</span> : facebook.status === "posted" ? <span className="text-accent-ink">publicada</span> : facebook.status === "failed" ? <span className="text-[#ff8a8a]">falló{facebook.error ? `: ${facebook.error}` : ""}</span> : "aún no"}
                </p>
                {canPublish && (
                  <button
                    type="button"
                    className="btn !px-3 !py-1 w-fit"
                    disabled={fbBusy}
                    onClick={() => {
                      setFbBusy(true);
                      void facebookPostNowAction(article.id)
                        .then(setFbMsg)
                        .finally(() => setFbBusy(false));
                    }}
                  >
                    {facebook.status === "posted" ? "Publicar de nuevo en Facebook" : "Publicar en Facebook ahora"}
                  </button>
                )}
              </div>
            )}
          </Section>

          <Section title="Datos" id="s-meta">
            <L id="cat" label="Categoría" hint="Obligatoria para publicar.">
              <select
                id="cat"
                className="input"
                value={f.categoryId}
                disabled={disabled}
                onChange={(e) => set("categoryId", e.target.value)}
              >
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </L>
            <div className="md:col-span-2">
              <ArtistPicker
                name="artistIds"
                label="Artistas o bandas de la nota (aparecerá en su perfil)"
                artists={artistOptions}
                initial={f.artistIds}
                max={20}
                disabled={disabled}
                onChange={(ids) => set("artistIds", ids)}
              />
            </div>
            <L id="tags" label="Etiquetas" hint="Separadas por comas (máx. 8).">
              <input
                id="tags"
                className="input"
                value={f.tags}
                disabled={disabled}
                onChange={(e) => set("tags", e.target.value)}
              />
            </L>
            <L id="author" label="Firma">
              <input
                id="author"
                className="input"
                value={f.authorName}
                maxLength={120}
                disabled={disabled}
                onChange={(e) => set("authorName", e.target.value)}
              />
            </L>
            <L id="slug" label="URL (slug)">
              <input
                id="slug"
                className="input"
                value={f.slug}
                maxLength={120}
                disabled={disabled}
                onChange={(e) => set("slug", e.target.value)}
                aria-invalid={!!errors.slug}
              />
              {errors.slug && (
                <p role="alert" className="mono text-[#ff8a8a]">
                  {errors.slug[0]}
                </p>
              )}
            </L>
            <L id="layout" label="Diseño">
              <select
                id="layout"
                className="input"
                value={f.layout}
                disabled={disabled}
                onChange={(e) => set("layout", e.target.value as "standard" | "special")}
              >
                <option value="standard">Estándar</option>
                <option value="special">Especial (narrativo)</option>
              </select>
            </L>
          </Section>

          <Section title="Portada" id="s-cover">
            <MediaUpload
              disabled={disabled}
              label="Subir imagen de portada"
              onUploaded={(media) => {
                set("coverUrl", media.url);
                set("coverAlt", media.alt);
                set("coverCredit", `${media.credit} · ${media.license}`);
                set("useArt", false);
              }}
            />
            <L
              id="coverUrl"
              label="URL externa (opcional)"
              hint="La imagen subida arriba se guarda de forma permanente. Esta opción se conserva para enlaces HTTPS ya existentes."
            >
              <input
                id="coverUrl"
                type="url"
                className="input"
                value={f.coverUrl}
                disabled={disabled}
                onChange={(e) => set("coverUrl", e.target.value)}
                aria-invalid={!!errors.coverUrl}
              />
              {errors.coverUrl && (
                <p role="alert" className="mono text-[#ff8a8a]">
                  {errors.coverUrl[0]}
                </p>
              )}
            </L>
            <L id="coverAlt" label="Texto alternativo">
              <input
                id="coverAlt"
                className="input"
                value={f.coverAlt}
                disabled={disabled}
                onChange={(e) => set("coverAlt", e.target.value)}
              />
            </L>
            <L id="coverCredit" label="Crédito / licencia">
              <input
                id="coverCredit"
                className="input"
                value={f.coverCredit}
                disabled={disabled}
                onChange={(e) => set("coverCredit", e.target.value)}
              />
            </L>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.useArt}
                disabled={disabled}
                onChange={(e) => set("useArt", e.target.checked)}
                className="size-4 accent-[#c6ff00]"
              />
              Usar ilustración generativa (sin imagen)
            </label>
            {f.useArt && (
              <div className="grid grid-cols-3 gap-2">
                <select
                  aria-label="Escena"
                  className="input"
                  value={f.art.scene}
                  disabled={disabled}
                  onChange={(e) => set("art", { ...f.art, scene: e.target.value as CoverArt["scene"] })}
                >
                  {SCENES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Tono"
                  className="input"
                  value={f.art.tone}
                  disabled={disabled}
                  onChange={(e) => set("art", { ...f.art, tone: e.target.value as CoverArt["tone"] })}
                >
                  {TONES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <input
                  aria-label="Semilla"
                  type="number"
                  min={0}
                  max={1000000}
                  className="input"
                  value={f.art.seed}
                  disabled={disabled}
                  onChange={(e) => set("art", { ...f.art, seed: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
            )}
          </Section>

          <Section title="SEO" id="s-seo">
            <L id="seoTitle" label="Título SEO" hint={`${f.seoTitle.length}/70`}>
              <input
                id="seoTitle"
                className="input"
                value={f.seoTitle}
                maxLength={70}
                disabled={disabled}
                onChange={(e) => set("seoTitle", e.target.value)}
              />
            </L>
            <L id="seoDesc" label="Descripción" hint={`${f.seoDescription.length}/170`}>
              <textarea
                id="seoDesc"
                className="input"
                value={f.seoDescription}
                maxLength={170}
                disabled={disabled}
                onChange={(e) => set("seoDescription", e.target.value)}
                style={{ minHeight: "4rem" }}
              />
            </L>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={f.noindex}
                disabled={disabled}
                onChange={(e) => set("noindex", e.target.checked)}
                className="size-4 accent-[#c6ff00]"
              />
              No indexar en buscadores
            </label>
            <div className="rounded-[8px] border border-line p-3" aria-label="Vista previa en buscador">
              <p className="truncate text-[#8ab4f8]">{seoTitleShown || "Título"}</p>
              <p className="mono truncate text-[#7ec46f]">stereoface · /noticias/{f.slug}</p>
              <p className="text-[0.82rem] text-muted">{(f.seoDescription || f.dek || "").slice(0, 170)}</p>
            </div>
          </Section>

          <Section title="Fuentes y referencias" id="s-refs">
            <L id="refs" label="Una por línea" hint="Formato: Título | https://enlace | Medio (opcional)">
              <textarea
                id="refs"
                className="input"
                value={f.refs}
                disabled={disabled}
                onChange={(e) => set("refs", e.target.value)}
                aria-invalid={!!errors.references}
              />
              {errors.references && (
                <p role="alert" className="mono text-[#ff8a8a]">
                  {errors.references[0]}
                </p>
              )}
            </L>
          </Section>

          <Section title={`Historial (${revisions.length})`} id="s-hist">
            {revisions.length === 0 && <p className="text-muted">Sin versiones todavía.</p>}
            <ul className="max-h-64 overflow-y-auto">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 border-t border-line py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{r.title}</span>
                    <span className="mono text-muted">
                      {new Date(r.createdAt).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                      {r.authorName}
                    </span>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn !px-3 !py-1.5"
                      onClick={async () => {
                        if (!window.confirm("¿Restaurar esta versión? La versión actual se guardará en el historial."))
                          return;
                        const r2 = await restoreRevisionAction(article.id, r.id);
                        if (handle(r2, "Versión restaurada")) window.location.reload();
                      }}
                    >
                      Restaurar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {canDelete && (
            <Section title="Zona delicada" id="s-del">
              <button
                type="button"
                className="btn w-fit !border-[#ff6b6b] !text-[#ff8a8a]"
                onClick={async () => {
                  if (window.confirm("¿Borrar este artículo? Se retira del sitio y del listado."))
                    await deleteArticleAction(article.id);
                }}
              >
                Borrar artículo
              </button>
            </Section>
          )}
        </aside>
      </div>

      {preview !== null && (
        <div
          role="dialog"
          aria-label="Vista previa del artículo"
          className="fixed inset-0 z-[70] overflow-y-auto bg-bg/95 p-4 backdrop-blur-sm"
        >
          <div className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="mono text-accent-ink">Vista previa (HTML saneado, igual que el público)</p>
              <button type="button" className="btn !px-4 !py-2" onClick={() => setPreview(null)} autoFocus>
                Cerrar
              </button>
            </div>
            {f.kicker && <p className="mono text-accent-ink">{f.kicker}</p>}
            <h1 className="display text-[clamp(2rem,5vw,4rem)]">{f.title}</h1>
            {f.dek && <p className="mt-4 text-[1.2rem] text-muted">{f.dek}</p>}
            <div className="article-body mt-8" dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        </div>
      )}
    </div>
  );
}
