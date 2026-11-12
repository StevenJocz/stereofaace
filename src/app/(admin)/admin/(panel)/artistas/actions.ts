"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, strs, type FormState } from "@/lib/admin/form";
import { createArtist, deleteArtist, restoreArtist, updateArtist } from "@/modules/artists/admin";

const LINK_KEYS = ["spotify", "soundcloud", "bandcamp", "youtube", "instagram", "web"] as const;

function artistRaw(fd: FormData) {
  const scene = str(fd, "scene");
  return {
    name: str(fd, "name"),
    slug: str(fd, "slug"),
    bio: str(fd, "bio"),
    country: str(fd, "country")?.toUpperCase(),
    genreIds: strs(fd, "genreIds"),
    photoId: str(fd, "photoId"),
    coverArt: scene ? { scene, tone: str(fd, "tone"), seed: Number(str(fd, "seed") ?? 0) } : undefined,
    links: Object.fromEntries(LINK_KEYS.map((k) => [k, str(fd, `link_${k}`)]).filter(([, v]) => v)),
    featured: fd.get("featured") === "on",
  };
}

export async function saveArtistAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  let createdId: string | undefined;
  const result = await guard(fd, "artistas", async () => {
    const db = await getDb();
    if (id) {
      await updateArtist(db, user, id, artistRaw(fd));
      return "Cambios guardados";
    }
    createdId = (await createArtist(db, user, artistRaw(fd))).id;
  });
  // redirect() lanza una excepción especial: debe ir fuera del try/catch.
  if (result?.ok && createdId) redirect(`/admin/artistas/${createdId}?creado=1`);
  return result;
}

export async function deleteArtistAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "artistas", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el artista");
    await deleteArtist(await getDb(), user, id);
    return "Artista oculto. Puedes restaurarlo desde el listado.";
  });
}

export async function restoreArtistAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "artistas", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el artista");
    await restoreArtist(await getDb(), user, id);
    return "Artista restaurado";
  });
}
