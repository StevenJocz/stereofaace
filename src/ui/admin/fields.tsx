import type { ReactNode } from "react";
import type { FormState } from "@/lib/admin/form";

/** Campo de formulario con etiqueta, ayuda y errores por campo. */
export function Field({
  label,
  name,
  errors,
  hint,
  children,
  className = "",
}: {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mono mb-1 block text-muted">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="mt-1 text-[0.78rem] text-muted">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} role="alert" className="mono mt-1 text-[#ff8a8a]">
          {e}
        </p>
      ))}
    </div>
  );
}

/** Resultado de la última acción de un formulario. */
export function Message({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mono ${state.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
      {state.message}
    </p>
  );
}

/** Cabecera de una pantalla de administración: sección, título y acción principal. */
export function PageHead({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mono text-accent-ink">{eyebrow}</p>}
        <h1 className="display t-l mt-1">{title}</h1>
      </div>
      {action}
    </div>
  );
}
