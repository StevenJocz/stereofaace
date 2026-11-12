"use client";

import { useActionState } from "react";
import { createDraftAction } from "@/app/(admin)/admin/(panel)/articulos/actions";

export function NewArticleForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createDraftAction, null);
  return (
    <form action={action} className="grid gap-5" noValidate>
      <div>
        <label htmlFor="title" className="mono mb-1 block text-muted">
          Título *
        </label>
        <input id="title" name="title" required minLength={3} maxLength={180} className="input" autoFocus />
      </div>
      <div>
        <label htmlFor="categoryId" className="mono mb-1 block text-muted">
          Categoría
        </label>
        <select id="categoryId" name="categoryId" className="input" defaultValue="">
          <option value="">Sin categoría (obligatoria para publicar)</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <p role="alert" className="mono min-h-5 text-[#ff8a8a]">
        {state?.message}
      </p>
      <button type="submit" disabled={pending} className="btn btn-accent w-fit">
        {pending ? "Creando…" : "Crear y abrir editor"}
      </button>
    </form>
  );
}
