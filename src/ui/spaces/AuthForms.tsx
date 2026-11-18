"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotAction, registerAction, resendAction, resetAction, spacesLoginAction, verifyAction, type FormState } from "@/app/(public)/spaces/actions";

function Msg({ s }: { s: FormState }) {
  if (!s?.message) return null;
  return (
    <p role={s.ok ? "status" : "alert"} className={`mono ${s.ok ? "text-accent-ink" : "text-[#ff8a8a]"}`}>
      {s.message}
    </p>
  );
}

function Shell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <div className="wrap py-10 sm:py-16">
      <div className="panel mx-auto max-w-md p-6 sm:p-8">
        <p className="mono text-accent-ink">{eyebrow}</p>
        <h1 className="display-up mt-1 text-[2rem] leading-none">{title}</h1>
        <div className="mt-6 grid gap-4">{children}</div>
      </div>
    </div>
  );
}

const F = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mono muted block">{label}</span>
    {children}
    {hint && <span className="mono muted mt-1 block text-[0.68rem]">{hint}</span>}
  </label>
);

export function RegisterForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(registerAction, null);
  return (
    <Shell eyebrow="StereoFace Spaces" title="Crea tu Space">
      <p className="muted -mt-2 text-[0.95rem]">Tu espacio. Tu sonido. Tu identidad. Primero tu cuenta; después eliges tu música y tu estilo.</p>
      <form action={action} className="grid gap-4" noValidate>
        <F label="Nombre de usuario" hint="3 a 20 caracteres: letras, números y guion bajo. Tu dirección será stereoface.online/@usuario">
          <input className="input" name="username" autoComplete="username" required maxLength={20} autoCapitalize="none" />
        </F>
        <F label="Correo">
          <input className="input" name="email" type="email" autoComplete="email" required maxLength={254} />
        </F>
        <F label="Contraseña" hint="Mínimo 12 caracteres.">
          <input className="input" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={200} />
        </F>
        <label className="flex items-start gap-2 text-[0.88rem]">
          <input type="checkbox" name="terms" className="mt-1" />
          <span>
            Acepto los{" "}
            <Link href="/pagina/terminos" className="text-accent-ink underline">
              términos
            </Link>{" "}
            y la{" "}
            <Link href="/pagina/privacidad" className="text-accent-ink underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>
        <Msg s={s} />
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Crear mi cuenta
        </button>
      </form>
      <p className="muted text-[0.9rem]">
        ¿Ya tienes cuenta?{" "}
        <Link href="/spaces/entrar" className="text-accent-ink underline">
          Entra
        </Link>
      </p>
    </Shell>
  );
}

export function LoginForm({ done }: { done: boolean }) {
  const [s, action, pending] = useActionState<FormState, FormData>(spacesLoginAction, null);
  return (
    <Shell eyebrow="StereoFace Spaces" title="Entrar">
      {done && <p role="status" className="mono text-accent-ink">Contraseña cambiada. Ya puedes entrar.</p>}
      <form action={action} className="grid gap-4" noValidate>
        <F label="Correo">
          <input className="input" name="email" type="email" autoComplete="email" required />
        </F>
        <F label="Contraseña">
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </F>
        <Msg s={s} />
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Entrar
        </button>
      </form>
      <p className="muted text-[0.9rem]">
        <Link href="/spaces/recuperar" className="text-accent-ink underline">
          Olvidé mi contraseña
        </Link>{" "}
        ·{" "}
        <Link href="/spaces/registro" className="text-accent-ink underline">
          Crear mi Space
        </Link>
      </p>
    </Shell>
  );
}

export function ForgotForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(forgotAction, null);
  return (
    <Shell eyebrow="StereoFace Spaces" title="Recuperar contraseña">
      <form action={action} className="grid gap-4" noValidate>
        <F label="Correo de tu cuenta">
          <input className="input" name="email" type="email" autoComplete="email" required />
        </F>
        <Msg s={s} />
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Enviarme el enlace
        </button>
      </form>
    </Shell>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(resetAction, null);
  return (
    <Shell eyebrow="StereoFace Spaces" title="Contraseña nueva">
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="token" value={token} />
        <F label="Contraseña nueva" hint="Mínimo 12 caracteres. Se cerrarán tus sesiones abiertas.">
          <input className="input" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={200} />
        </F>
        <Msg s={s} />
        <button type="submit" className="btn btn-accent" disabled={pending}>
          Cambiar contraseña
        </button>
      </form>
    </Shell>
  );
}

export function VerifyForm({ token }: { token: string }) {
  const [s, action, pending] = useActionState<FormState, FormData>(verifyAction, null);
  return (
    <Shell eyebrow="StereoFace Spaces" title="Confirmar correo">
      {s?.ok ? (
        <>
          <Msg s={s} />
          <Link href="/spaces/editar" className="btn btn-accent">
            Ir a mi Space
          </Link>
        </>
      ) : (
        <form action={action} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          <p className="muted">Pulsa para confirmar que este correo es tuyo.</p>
          <Msg s={s} />
          <button type="submit" className="btn btn-accent" disabled={pending}>
            Confirmar mi correo
          </button>
        </form>
      )}
    </Shell>
  );
}

export function ResendButton() {
  const [s, action, pending] = useActionState<FormState, FormData>(resendAction as never, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button type="submit" className="btn !px-3 !py-1.5" disabled={pending}>
        Reenviar correo de confirmación
      </button>
      <Msg s={s} />
    </form>
  );
}
