"use client";

import { useActionState } from "react";
import { subscribeAction, type SubscribeState } from "@/app/(public)/actions";

export function NewsletterForm() {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeAction, null);
  return (
    <form action={action} className="mt-5" aria-describedby="nl-status" noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="nl-email" className="sr-only">
          Correo electrónico
        </label>
        <input
          id="nl-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="Tu correo electrónico"
          aria-invalid={state && !state.ok ? true : undefined}
          className="mono w-full rounded-full border border-line bg-transparent px-5 py-3"
        />
        <button type="submit" disabled={pending} className="btn btn-accent justify-center">
          {pending ? "Enviando…" : "Suscribirme"}
        </button>
      </div>
      <p id="nl-status" role="status" className={`mono mt-2 ${state?.ok === false ? "text-[#ff8a8a]" : "muted"}`}>
        {state?.message ?? "Sin spam. Puedes darte de baja cuando quieras."}
      </p>
    </form>
  );
}
