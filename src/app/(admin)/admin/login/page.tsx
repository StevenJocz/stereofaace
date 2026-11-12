import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { Mark } from "@/ui/Header";
import { LoginForm } from "./LoginForm";

async function LoginGate({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}

export default function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="flex items-center gap-3">
        <Mark size={40} />
        <p className="display-wide text-[1.4rem]">
          Stereo<span className="text-accent-ink">Face</span>
        </p>
      </div>
      <h1 className="display mt-10 text-[2.6rem]">Administración</h1>
      <p className="mono mt-2 text-muted">Acceso restringido al equipo editorial</p>
      <Suspense fallback={<div className="mt-8 h-64" aria-busy="true" />}>
        <LoginGate searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
