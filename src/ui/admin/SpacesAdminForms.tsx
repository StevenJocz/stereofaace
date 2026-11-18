"use client";

import { useActionState } from "react";
import { addGenreAction } from "@/app/(admin)/admin/(panel)/spaces/actions";
import type { FormState } from "@/lib/admin/form";
import { Message } from "./fields";

export function AddGenreForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addGenreAction, null);
  return (
    <form key={state?.nonce ?? "g"} action={action} className="flex flex-wrap items-end gap-3" noValidate>
      <label className="block">
        <span className="mono muted block">Identificador</span>
        <input name="slug" className="input" placeholder="dub-techno" maxLength={40} required />
      </label>
      <label className="block">
        <span className="mono muted block">Nombre</span>
        <input name="name" className="input" placeholder="Dub Techno" maxLength={40} required />
      </label>
      <button type="submit" className="btn" disabled={pending}>Agregar género</button>
      <Message state={state} />
    </form>
  );
}
