"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { assertCan, ForbiddenError } from "@/lib/rbac";
import { sanitizeArticleHtml } from "@/lib/sanitize";
import { fieldErrors, type FieldErrors } from "@/lib/validation";
import {
  createArticle,
  deleteArticle,
  getArticleAdmin,
  restoreRevision,
  setArticleStatus,
  updateArticle,
} from "@/modules/content/admin";
import type { ArticleState } from "@/modules/content/schema";
import { publishArticleToFacebook } from "@/modules/social/facebook";

/** Tras publicar, la nota se sube a Facebook en segundo plano: un fallo allí nunca afecta a la publicación. */
function shareOnFacebook(id: string) {
  after(async () => {
    try {
      await publishArticleToFacebook(await getDb(), id);
    } catch (error) {
      console.error("[facebook]", error);
    }
  });
}

export type SaveResult =
  | { ok: true; updatedAt: string; slug: string; message?: string }
  | { ok: false; code: "conflict" | "invalid" | "forbidden" | "error"; message: string; errors?: FieldErrors };

async function run<T extends object>(
  work: () => Promise<T>,
): Promise<(T & { ok: true }) | Extract<SaveResult, { ok: false }>> {
  try {
    return { ok: true, ...(await work()) };
  } catch (e) {
    if (e instanceof ZodError)
      return { ok: false, code: "invalid", message: "Revisa los campos marcados.", errors: fieldErrors(e) };
    if (e instanceof ForbiddenError)
      return { ok: false, code: "forbidden", message: "No tienes permiso para esta acción." };
    if (e instanceof DomainError)
      return { ok: false, code: e.code === "conflict" ? "conflict" : "error", message: e.message };
    console.error("[admin/articulos]", e);
    return { ok: false, code: "error", message: "No se pudo completar la acción. Inténtalo de nuevo." };
  }
}

/** Crea un borrador con título y categoría y abre el editor. */
export async function createDraftAction(
  _prev: { message?: string } | null,
  fd: FormData,
): Promise<{ message?: string } | null> {
  const user = await requireUser();
  const title = String(fd.get("title") ?? "").trim();
  const categoryId = String(fd.get("categoryId") ?? "") || undefined;
  let id: string | undefined;
  const r = await run(async () => {
    id = (await createArticle(await getDb(), user, { title, categoryId, status: "draft" })).id;
    return {};
  });
  if (!r.ok) return { message: r.errors?.title?.[0] ?? r.message };
  redirect(`/admin/articulos/${id}`);
}

/** Guardado manual y automático: devuelve la nueva marca de versión para detectar conflictos. */
export async function saveArticleAction(id: string, payload: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const r = await run(async () => {
    const res = await updateArticle(await getDb(), user, id, payload);
    return { updatedAt: res.updatedAt.toISOString(), slug: res.slug };
  });
  if (r.ok) {
    revalidatePath("/admin/articulos");
    const status = (payload as { status?: string } | null)?.status;
    if (status === "published" || status === "scheduled") shareOnFacebook(id);
  }
  return r;
}

export async function statusAction(id: string, status: ArticleState, scheduledFor?: string): Promise<SaveResult> {
  const user = await requireUser();
  const r = await run(async () => {
    const db = await getDb();
    await setArticleStatus(db, user, id, status, scheduledFor ? new Date(scheduledFor) : undefined);
    const row = await getArticleAdmin(db, user, id);
    return { updatedAt: (row?.updatedAt ?? new Date()).toISOString(), slug: row?.slug ?? "" };
  });
  if (r.ok) {
    revalidatePath("/admin", "layout");
    if (status === "published" || status === "scheduled") shareOnFacebook(id);
  }
  return r;
}

export async function restoreRevisionAction(id: string, revisionId: string): Promise<SaveResult> {
  const user = await requireUser();
  const r = await run(async () => {
    const db = await getDb();
    await restoreRevision(db, user, id, revisionId);
    const row = await getArticleAdmin(db, user, id);
    return { updatedAt: (row?.updatedAt ?? new Date()).toISOString(), slug: row?.slug ?? "" };
  });
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function deleteArticleAction(id: string): Promise<SaveResult> {
  const user = await requireUser();
  const r = await run(async () => {
    await deleteArticle(await getDb(), user, id);
    return { updatedAt: new Date().toISOString(), slug: "" };
  });
  if (r.ok) redirect("/admin/articulos?borrado=1");
  return r;
}

/** Vista previa fiel: devuelve exactamente el HTML saneado que vería el público. */
export async function previewAction(html: string): Promise<string> {
  await requireUser();
  return sanitizeArticleHtml(html.slice(0, 400_000));
}

/** Botón del editor: publica (o vuelve a publicar) la nota en Facebook ahora y devuelve el resultado. */
export async function facebookPostNowAction(id: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  try {
    assertCan(user, "article:publish");
    const res = await publishArticleToFacebook(await getDb(), id, { force: true });
    revalidatePath(`/admin/articulos/${id}`);
    if (res.status === "posted") return { ok: true, message: "Publicada en Facebook." };
    if (res.status === "failed") return { ok: false, message: `Facebook no la aceptó: ${res.error}` };
    return { ok: false, message: "No se publicó: revisa que Facebook esté activado y que la nota sea pública." };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, message: "No tienes permiso para esta acción." };
    console.error("[admin/facebook]", e);
    return { ok: false, message: "No se pudo completar la acción." };
  }
}
