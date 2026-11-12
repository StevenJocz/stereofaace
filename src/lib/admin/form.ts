import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { DomainError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/rbac";
import { fieldErrors, type FieldErrors } from "@/lib/validation";

/** Estado de un formulario de administración (useActionState). */
export type FormState = {
  ok?: boolean;
  message?: string;
  errors?: FieldErrors;
  /** Valores enviados, para no perder lo escrito cuando hay errores. */
  values?: Record<string, string | string[]>;
  nonce?: number;
} | null;

/** Texto no vacío de un campo, o `undefined`. */
export const str = (fd: FormData, k: string): string | undefined => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
};

/** Todos los valores de texto de un campo repetido. */
export const strs = (fd: FormData, k: string): string[] =>
  fd.getAll(k).filter((x): x is string => typeof x === "string" && x.trim() !== "");

export function snapshot(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const k of new Set(fd.keys())) {
    if (k.startsWith("$")) continue;
    const all = fd.getAll(k).filter((x): x is string => typeof x === "string");
    out[k] = all.length > 1 ? all : (all[0] ?? "");
  }
  return out;
}

/**
 * Ejecuta una acción de administración y traduce los errores esperables a un estado de formulario;
 * los inesperados se registran y no se detallan. Tras un éxito refresca el panel y la portada.
 */
export async function guard(fd: FormData, label: string, work: () => Promise<string | void>): Promise<FormState> {
  const nonce = Date.now();
  try {
    const message = await work();
    revalidatePath("/admin", "layout");
    revalidatePath("/");
    return { ok: true, message: message ?? "Guardado", nonce };
  } catch (error) {
    if (error instanceof ZodError)
      return { message: "Revisa los campos marcados.", errors: fieldErrors(error), values: snapshot(fd), nonce };
    if (error instanceof ForbiddenError)
      return { message: "No tienes permiso para esta acción.", values: snapshot(fd), nonce };
    if (error instanceof DomainError) return { message: error.message, values: snapshot(fd), nonce };
    console.error(`[admin/${label}]`, error);
    return { message: "No se pudo completar la acción. Inténtalo de nuevo.", values: snapshot(fd), nonce };
  }
}
