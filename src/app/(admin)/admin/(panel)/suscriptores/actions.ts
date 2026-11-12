"use server";

import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { guard, str, type FormState } from "@/lib/admin/form";
import { deleteSubscriber, setSubscriberStatus } from "@/modules/settings/subscribers-admin";
import { SUBSCRIBER_STATES, type SubscriberState } from "@/modules/settings/schema";

export async function subscriberStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status") as SubscriberState | undefined;
  return guard(fd, "suscriptores", async () => {
    if (!id || !status || !SUBSCRIBER_STATES.includes(status)) throw new DomainError("bad_request", "Solicitud inválida");
    await setSubscriberStatus(await getDb(), user, id, status);
    return "Estado actualizado";
  });
}

export async function deleteSubscriberAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, "suscriptores", async () => {
    if (!id) throw new DomainError("bad_request", "Falta el suscriptor");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await deleteSubscriber(await getDb(), user, id);
    return "Suscriptor borrado";
  });
}
