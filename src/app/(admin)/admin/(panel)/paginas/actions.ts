"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { createPage, deletePage, setPageStatus, updatePage } from "@/modules/content/pages-admin";

function pageRaw(fd: FormData) {
  let bodyJson: unknown;
  try {
    const raw = str(fd, "bodyJson");
    bodyJson = raw ? JSON.parse(raw) : undefined;
  } catch {
    throw new DomainError("bad_request", "El contenido del editor no es válido. Recarga la página.");
  }
  return {
    title: str(fd, "title"),
    slug: str(fd, "slug"),
    bodyJson,
    bodyHtml: String(fd.get("bodyHtml") ?? ""),
    seo: { title: str(fd, "seoTitle"), description: str(fd, "seoDescription") },
  };
}

export async function savePageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  let createdId: string | undefined;
  const result = await guard(fd, "paginas", async () => {
    const db = await getDb();
    if (id) {
      await updatePage(db, user, id, pageRaw(fd));
      return "Cambios guardados";
    }
    createdId = (await createPage(db, user, pageRaw(fd))).id;
  });
  if (result?.ok && createdId) redirect(`/admin/paginas/${createdId}?creada=1`);
  return result;
}

export async function pageStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status");
  return guard(fd, "paginas", async () => {
    if (!id || (status !== "draft" && status !== "published")) throw new DomainError("bad_request", "Solicitud inválida");
    await setPageStatus(await getDb(), user, id, status);
    return status === "published" ? "Página publicada" : "Vuelta a borrador";
  });
}

export async function deletePageAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const result = await guard(fd, "paginas", async () => {
    if (!id) throw new DomainError("bad_request", "Falta la página");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await deletePage(await getDb(), user, id);
  });
  if (result?.ok) redirect("/admin/paginas?borrada=1");
  return result;
}
