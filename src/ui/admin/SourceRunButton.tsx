"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/admin/form";

/** Botón de una acción sobre la fuente que muestra el resultado (éxito o error) debajo, en lugar de solo el error. */
export function SourceRunButton({
  action,
  id,
  label,
  pendingLabel,
  accent = false,
  disabled = false,
  title,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  id: string;
  label: string;
  pendingLabel: string;
  accent?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [state, run, pending] = useActionState<FormState, FormData>(action, null);
  return (
    <form action={run} className="grid gap-1.5">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={accent ? "btn btn-accent !px-3 !py-1.5 w-fit" : "btn !px-3 !py-1.5 w-fit"} disabled={pending || disabled} title={title}>
        {pending ? pendingLabel : label}
      </button>
      {state?.message && (
        <p role={state.ok ? "status" : "alert"} className={`mono max-w-[60ch] text-[0.72rem] ${state.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
