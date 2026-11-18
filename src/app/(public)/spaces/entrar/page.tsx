import type { Metadata } from "next";
import { LoginForm } from "@/ui/spaces/AuthForms";
import { SignedInRedirect } from "@/ui/spaces/SignedInRedirect";

export const metadata: Metadata = { title: "Entrar · StereoFace Spaces", robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ listo?: string }> }) {
  return (
    <SignedInRedirect>
      <LoginForm done={Boolean((await searchParams).listo)} />
    </SignedInRedirect>
  );
}
