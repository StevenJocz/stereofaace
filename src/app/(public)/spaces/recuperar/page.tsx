import type { Metadata } from "next";
import { ForgotForm } from "@/ui/spaces/AuthForms";
import { SignedInRedirect } from "@/ui/spaces/SignedInRedirect";

export const metadata: Metadata = { title: "Recuperar · StereoFace Spaces", robots: { index: false } };

export default function Page() {
  return (
    <SignedInRedirect>
      <ForgotForm />
    </SignedInRedirect>
  );
}
