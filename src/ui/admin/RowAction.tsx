"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/admin/form";

/** Botón de una acción rápida (subir, activar, restaurar…) con su mensaje de error. Envía `fields` como campos ocultos. */
export function RowAction({
  action,
  fields,
  label,
  ariaLabel,
  className = "btn !px-3 !py-1",
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  fields: Record<string, string>;
  label: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  return (
    <form action={run} className="inline-flex items-center gap-2">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={className} disabled={pending} aria-label={ariaLabel}>
        {label}
      </button>
      {state && !state.ok && (
        <span role="alert" className="mono text-[#ff8a8a]">
          {state.message}
        </span>
      )}
    </form>
  );
}
