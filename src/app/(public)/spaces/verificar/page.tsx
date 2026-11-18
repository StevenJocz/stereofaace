import type { Metadata } from "next";
import Link from "next/link";
import { VerifyForm } from "@/ui/spaces/AuthForms";

export const metadata: Metadata = { title: "Confirmar correo · StereoFace Spaces", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) return <p className="wrap py-16 text-muted">Falta el enlace. <Link href="/spaces/editar" className="text-accent-ink underline">Pide otro desde tu Space</Link>.</p>;
  return <VerifyForm token={token} />;
}
