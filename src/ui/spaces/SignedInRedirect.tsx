import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

async function Gate({ children }: { children: React.ReactNode }) {
  await connection();
  // Si ya hay una sesión abierta no se vuelve a pedir el acceso: se va directo al Space.
  if (await getCurrentUser()) redirect("/spaces/editar");
  return <>{children}</>;
}

/** Envuelve las pantallas de entrar, registrarse y recuperar: quien ya está dentro pasa derecho a su Space. */
export function SignedInRedirect({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="wrap py-16" aria-busy="true" />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
