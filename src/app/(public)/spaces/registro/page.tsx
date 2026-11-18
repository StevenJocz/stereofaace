import type { Metadata } from "next";
import { RegisterForm } from "@/ui/spaces/AuthForms";
import { SignedInRedirect } from "@/ui/spaces/SignedInRedirect";

export const metadata: Metadata = { title: "Registro · StereoFace Spaces", robots: { index: false } };

export default function Page() {
  return (
    <SignedInRedirect>
      <RegisterForm />
    </SignedInRedirect>
  );
}
