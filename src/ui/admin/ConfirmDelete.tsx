"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/admin/form";

/** Borrado con confirmación: hay que escribir BORRAR. La acción recibe `id` y `confirm` en el FormData. */
export function ConfirmDelete({
  id,
  action,
  label = "Borrar",
  fields = {},
}: {
  id: string;
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  label?: string;
  /** Campos ocultos adicionales (p. ej. el tipo de elemento). */
  fields?: Record<string, string>;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  return (
    <form key={state?.nonce ?? "init"} action={run} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="sr-only" htmlFor={`confirm-${id}`}>
        Escribe BORRAR para confirmar
      </label>
      <input
        id={`confirm-${id}`}
        name="confirm"
        placeholder="Escribe BORRAR"
        autoComplete="off"
        className="input !w-40"
      />
      <button type="submit" disabled={pending} className="btn !px-4 !py-2">
        {label}
      </button>
      {state?.message && (
        <span role={state.ok ? "status" : "alert"} className={`mono ${state.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
