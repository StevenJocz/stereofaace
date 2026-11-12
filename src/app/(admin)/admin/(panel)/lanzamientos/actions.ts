"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, strs, type FormState } from "@/lib/admin/form";
import { createRelease, deleteRelease, restoreRelease, setReleaseStatus, updateRelease } from "@/modules/releases/admin";

function releaseRaw(fd: FormData) {
  const scene = str(fd, "scene");
  return {
    title: str(fd, "title"),
    slug: str(fd, "slug"),
    kind: str(fd, "kind"),
    releasedAt: str(fd, "releasedAt"),
    label: str(fd, "label"),
    artistIds: strs(fd, "artistIds"),
    coverId: str(fd, "coverId"),
    coverArt: scene ? { scene, tone: str(fd, "tone"), seed: Number(str(fd, "seed") ?? 0) } : undefined,
    embedUrl: str(fd, "embedUrl"),
    status: str(fd, "status") ?? "draft",
  };
}

export async function saveReleaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  let createdId: string | undefined;
  const result = await guard(fd, "lanzamientos", async () => {
    const db = await getDb();
    if (id) {
      await updateRelease(db, user, id, releaseRaw(fd));
      return "Cambios guardados";
    }
    createdId = (await createRelease(db, user, releaseRaw(fd))).id;
  });
  if (result?.ok && createdId) redirect(`/admin/lanzamientos/${createdId}?creado=1`);
  return result;
}

export async function releaseStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status");
  return guard(fd, "lanzamientos", async () => {
    if (!id || (status !== "draft" && status !== "published")) throw new DomainError("bad_request", "Solicitud inválida");
    await setReleaseStatus(await getDb(), user, id, status);
    return status === "published" ? "Lanzamiento publicado" : "Vuelto a borrador";
  });
}

export async function deleteReleaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "lanzamientos", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el lanzamiento");
    await deleteRelease(await getDb(), user, id);
    return "Lanzamiento oculto. Puedes restaurarlo desde el listado.";
  });
}

export async function restoreReleaseAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "lanzamientos", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el lanzamiento");
    await restoreRelease(await getDb(), user, id);
    return "Lanzamiento restaurado";
  });
}
