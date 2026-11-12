"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { createUserAdmin, resetUserPassword, updateUserAdmin } from "@/modules/users/admin";

export async function createUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  let createdId: string | undefined;
  const result = await guard(fd, "usuarios", async () => {
    createdId = (
      await createUserAdmin(await getDb(), user, {
        email: str(fd, "email"),
        name: str(fd, "name"),
        role: str(fd, "role"),
        password: String(fd.get("password") ?? ""),
      })
    ).id;
  });
  if (result?.ok && createdId) redirect(`/admin/usuarios/${createdId}?creado=1`);
  // Nunca se devuelve la contraseña escrita.
  return result ? { ...result, values: result.values && { ...result.values, password: "" } } : result;
}

export async function updateUserAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "usuarios", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el usuario");
    await updateUserAdmin(await getDb(), user, id, {
      name: str(fd, "name"),
      role: str(fd, "role"),
      active: fd.get("active") === "on",
    });
    return "Cambios guardados";
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
