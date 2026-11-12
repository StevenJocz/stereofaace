"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, strs, type FormState } from "@/lib/admin/form";
import { createEvent, deleteEvent, restoreEvent, setEventStatus, updateEvent } from "@/modules/events/admin";
import { fromBogotaInput } from "@/ui/admin/countries";

function eventRaw(fd: FormData) {
  const scene = str(fd, "scene");
  return {
    name: str(fd, "name"),
    slug: str(fd, "slug"),
    kind: str(fd, "kind"),
    startsAt: fromBogotaInput(str(fd, "startsAt")),
    endsAt: fromBogotaInput(str(fd, "endsAt")),
    venue: str(fd, "venue"),
    city: str(fd, "city"),
    country: str(fd, "country")?.toUpperCase(),
    description: str(fd, "description"),
    genreId: str(fd, "genreId"),
    artistIds: strs(fd, "artistIds"),
    ticketUrl: str(fd, "ticketUrl"),
    coverArt: scene ? { scene, tone: str(fd, "tone"), seed: Number(str(fd, "seed") ?? 0) } : undefined,
    status: str(fd, "status") ?? "draft",
  };
}

export async function saveEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  let createdId: string | undefined;
  const result = await guard(fd, "agenda", async () => {
    const db = await getDb();
    if (id) {
      await updateEvent(db, user, id, eventRaw(fd));
      return "Cambios guardados";
    }
    createdId = (await createEvent(db, user, eventRaw(fd))).id;
  });
  if (result?.ok && createdId) redirect(`/admin/agenda/${createdId}?creado=1`);
  return result;
}

export async function eventStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status");
  return guard(fd, "agenda", async () => {
    if (!id || (status !== "draft" && status !== "published" && status !== "cancelled"))
      throw new DomainError("bad_request", "Solicitud inválida");
    await setEventStatus(await getDb(), user, id, status);
    return status === "published" ? "Evento publicado" : status === "cancelled" ? "Evento cancelado" : "Vuelto a borrador";
  });
}

export async function deleteEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "agenda", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el evento");
    await deleteEvent(await getDb(), user, id);
    return "Evento oculto. Puedes restaurarlo desde el listado.";
  });
}

export async function restoreEventAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "agenda", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el evento");
    await restoreEvent(await getDb(), user, id);
    return "Evento restaurado";
  });
}
