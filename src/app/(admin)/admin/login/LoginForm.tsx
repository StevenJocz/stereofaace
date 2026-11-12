"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, null);
  return (
    <form action={action} className="mt-8 flex flex-col gap-4" aria-describedby="login-error">
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="email" className="mono mb-1 block text-muted">
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          className="input"
        />
      </div>
      <div>
        <label htmlFor="password" className="mono mb-1 block text-muted">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className="input"
        />
      </div>
      <p id="login-error" role="alert" className="mono min-h-5 text-[#ff8a8a]">
        {state?.message}
      </p>
      <button type="submit" disabled={pending} className="btn btn-accent justify-center">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
