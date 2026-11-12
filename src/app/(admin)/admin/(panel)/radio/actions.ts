"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";
import { fieldErrors, type FieldErrors } from "@/lib/validation";
import {
  createStation,
  deleteStation,
  setStationAuthorization,
  setStationEnabled,
  updateStation,
} from "@/modules/radio/service";

export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Valores enviados, para no perder lo escrito cuando hay errores. */
  values?: Record<string, string | string[]>;
  nonce?: number;
} | null;

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

function stationRaw(fd: FormData) {
  return {
    name: str(fd, "name"),
    slug: str(fd, "slug"),
    description: str(fd, "description"),
    country: str(fd, "country")?.toUpperCase(),
    genreIds: fd.getAll("genreIds").filter((x): x is string => typeof x === "string"),
    streamKind: str(fd, "streamKind"),
    streamUrl: str(fd, "streamUrl"),
    embedUrl: str(fd, "embedUrl"),
    corsEnabled: fd.get("corsEnabled") === "on",
    imageUrl: str(fd, "imageUrl"),
    websiteUrl: str(fd, "websiteUrl"),
    attributionName: str(fd, "attributionName"),
    attributionUrl: str(fd, "attributionUrl"),
    attributionNote: str(fd, "attributionNote"),
    position: Number(str(fd, "position") ?? 0),
  };
}

function snapshot(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const k of new Set(fd.keys())) {
    if (k.startsWith("$")) continue;
    const all = fd.getAll(k).filter((x): x is string => typeof x === "string");
    out[k] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}

/** Traduce los errores esperables a un estado de formulario; los inesperados se registran y no se detallan. */
async function guard(fd: FormData, work: () => Promise<string | void>): Promise<FormState> {
  const nonce = Date.now();
  try {
    const message = await work();
    // Las páginas de administración leen siempre de la base de datos: se refrescan tras cada cambio.
    revalidatePath("/admin", "layout");
    return { ok: true, message: message ?? "Guardado", nonce };
  } catch (error) {
    if (error instanceof ZodError)
      return { message: "Revisa los campos marcados.", errors: fieldErrors(error), values: snapshot(fd), nonce };
    if (error instanceof ForbiddenError)
      return { message: "No tienes permiso para esta acción.", values: snapshot(fd), nonce };
    if (error instanceof DomainError) return { message: error.message, values: snapshot(fd), nonce };
    console.error("[admin/radio]", error);
    return { message: "No se pudo completar la acción. Inténtalo de nuevo.", values: snapshot(fd), nonce };
  }
}

export async function saveStationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  let createdId: string | undefined;
  const result = await guard(fd, async () => {
    const db = await getDb();
    if (id) {
      const r = await updateStation(db, user, id, stationRaw(fd));
      return r.autoDisabled
        ? "Guardado. Cambiaste la fuente de la señal, así que la emisora se desactivó: vuelve a activarla tras confirmar la autorización."
        : "Cambios guardados";
    }
    createdId = (await createStation(db, user, stationRaw(fd))).id;
  });
  // redirect() lanza una excepción especial: debe ir fuera del try/catch.
  if (result?.ok && createdId) redirect(`/admin/radio/${createdId}?creada=1`);
  return result;
}

export async function authorizationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  return guard(fd, async () => {
    if (!id) throw new DomainError("bad_request", "Falta la emisora");
    await setStationAuthorization(await getDb(), user, id, {
      status: str(fd, "status"),
      notes: str(fd, "notes"),
      verifiedAt: str(fd, "verifiedAt"),
    });
    return "Autorización registrada";
  });
}

export async function toggleEnabledAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const enable = fd.get("enable") === "1";
  return guard(fd, async () => {
    if (!id) throw new DomainError("bad_request", "Falta la emisora");
    await setStationEnabled(await getDb(), user, id, enable);
    return enable ? "Emisora activada: ya aparece en el reproductor" : "Emisora desactivada";
  });
}

export async function deleteStationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const result = await guard(fd, async () => {
    if (!id) throw new DomainError("bad_request", "Falta la emisora");
    if (fd.get("confirm") !== "BORRAR") throw new DomainError("confirm", "Escribe BORRAR para confirmar");
    await deleteStation(await getDb(), user, id);
  });
  if (result?.ok) redirect("/admin/radio?borrada=1");
  return result;
}
