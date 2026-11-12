"use server";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { deleteMedia, updateMediaMeta } from "@/modules/media/admin";

export async function updateMediaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "medios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta la imagen");
    await updateMediaMeta(await getDb(), user, id, {
      alt: str(fd, "alt"),
      credit: str(fd, "credit"),
      license: str(fd, "license"),
    });
    return "Metadatos guardados";
  });
}

export async function deleteMediaAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "medios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta la imagen");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await deleteMedia(await getDb(), user, id);
    return "Imagen borrada";
  });
}
