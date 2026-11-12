"use server";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { moveHomeBlock, removeHomeBlock, saveHomeBlock, setHomeBlockActive } from "@/modules/content/home-blocks";

export async function saveBlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const kind = str(fd, "kind");
  const path = [str(fd, "path0"), str(fd, "path1"), str(fd, "path2")];
  const accent = str(fd, "accentFrom");
  return guard(fd, "portada", async () => {
    await saveHomeBlock(await getDb(), user, {
      id: str(fd, "id"),
      kind,
      articleId: str(fd, "articleId"),
      config:
        kind === "hero"
          ? {
              accentFrom: accent === undefined ? undefined : Number(accent),
              phrase: str(fd, "phrase"),
              place: str(fd, "place"),
              cta: str(fd, "cta"),
              meta: str(fd, "meta"),
              path: path.some(Boolean) ? path : undefined, // incompleta → error de validación
              figure: fd.get("figure") === "on",
            }
          : undefined,
    });
    return "Bloque guardado";
  });
}

export async function moveBlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const direction = str(fd, "direction");
  return guard(fd, "portada", async () => {
    if (!id || (direction !== "up" && direction !== "down")) throw new DomainError("bad_request", "Solicitud inválida");
    await moveHomeBlock(await getDb(), user, id, direction);
    return "Orden actualizado";
  });
}

export async function activeBlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const active = fd.get("active") === "1";
  return guard(fd, "portada", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el bloque");
    await setHomeBlockActive(await getDb(), user, id, active);
    return active ? "Bloque activado" : "Bloque desactivado";
  });
}

export async function removeBlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "portada", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el bloque");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await removeHomeBlock(await getDb(), user, id);
    return "Bloque quitado de la portada";
  });
}
