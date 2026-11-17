"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, strs, type FormState } from "@/lib/admin/form";
import { assignPrograms, createUserAdmin, resetUserPassword, resyncDj, updateUserAdmin } from "@/modules/users/admin";

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  let createdId: string | undefined;
  let aviso = "";
  const result = await guard(fd, "usuarios", async () => {
    const created = await createUserAdmin(await getDb(), user, {
      email: str(fd, "email"),
      name: str(fd, "name"),
      role: str(fd, "role"),
      password: String(fd.get("password") ?? ""),
      programId: str(fd, "programId"),
    });
    createdId = created.id;
    aviso = created.dj && !created.dj.ok ? (created.dj.warning ?? "") : "";
  });
  if (result?.ok && createdId) redirect(`/admin/usuarios/${createdId}?creado=1${aviso ? `&aviso=${encodeURIComponent(aviso.slice(0, 200))}` : ""}`);
  // Nunca se devuelve la contraseña escrita.
  return result ? { ...result, values: result.values && { ...result.values, password: "" } } : result;
}

export async function updateUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "usuarios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el usuario");
    const { dj } = await updateUserAdmin(await getDb(), user, id, {
      name: str(fd, "name"),
      role: str(fd, "role"),
      active: fd.get("active") === "on",
    });
    return dj && !dj.ok ? `Cambios guardados. AzuraCast: ${dj.warning}` : "Cambios guardados";
  });
}

export async function resetPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const result = await guard(fd, "usuarios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el usuario");
    await resetUserPassword(await getDb(), user, id, String(fd.get("password") ?? ""));
    return "Contraseña cambiada. Se cerraron sus sesiones abiertas.";
  });
  return result ? { ...result, values: undefined } : result;
}

export async function assignProgramsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "usuarios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el usuario");
    const dj = await assignPrograms(await getDb(), user, id, strs(fd, "programIds"));
    return dj.ok ? `Programas guardados y horario enviado a AzuraCast.${dj.warning ? ` ${dj.warning}` : ""}` : `Programas guardados, pero AzuraCast no se actualizó: ${dj.warning}`;
  });
}

export async function resyncDjAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "usuarios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el usuario");
    const dj = await resyncDj(await getDb(), user, id);
    if (!dj.ok) throw new DomainError("azuracast_sync", dj.warning ?? "AzuraCast no respondió.");
    return `Cuenta de DJ sincronizada con AzuraCast.${dj.warning ? ` ${dj.warning}` : ""}`;
  });
}
