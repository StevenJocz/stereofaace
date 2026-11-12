"use server";

import { guard, type FormState } from "@/lib/admin/form";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addSlot, deleteProgram, removeSlot, saveProgram } from "@/modules/schedule/service";

const val = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => val(fd, k) || undefined;

export async function saveProgramAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "programa", async () => {
    await saveProgram(await getDb(), user, {
      id: opt(fd, "id"),
      name: val(fd, "name"),
      description: opt(fd, "description"),
      hosts: opt(fd, "hosts"),
      djUsername: opt(fd, "djUsername")?.toLowerCase(),
      photoId: opt(fd, "photoId"),
      color: opt(fd, "color"),
      active: fd.get("active") === "on",
    });
    return "Programa guardado";
  });
}

export async function deleteProgramAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "programa-borrar", async () => {
    if (val(fd, "confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar.");
    await deleteProgram(await getDb(), user, val(fd, "id"));
    return "Programa borrado";
  });
}

export async function addSlotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "tramo", async () => {
    const kind = val(fd, "kind") === "once" ? "once" : "weekly";
    await addSlot(await getDb(), user, {
      programId: val(fd, "programId"),
      kind,
      weekday: kind === "weekly" && val(fd, "weekday") !== "" ? Number(val(fd, "weekday")) : undefined,
      date: kind === "once" ? opt(fd, "date") : undefined,
      start: val(fd, "start"),
      end: val(fd, "end"),
    });
    return "Tramo agregado";
  });
}

export async function removeSlotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  return guard(fd, "tramo-borrar", async () => {
    await removeSlot(await getDb(), user, val(fd, "id"));
  });
}
