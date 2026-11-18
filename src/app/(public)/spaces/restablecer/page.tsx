import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "@/ui/spaces/AuthForms";

export const metadata: Metadata = { title: "Restablecer contraseña · StereoFace Spaces", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <p className="wrap py-16 text-muted">Falta el enlace. <Link href="/spaces/recuperar" className="text-accent-ink underline">Pide uno nuevo</Link>.</p>;
  return <ResetForm token={token} />;
}
