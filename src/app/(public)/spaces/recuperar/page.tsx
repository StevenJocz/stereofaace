import type { Metadata } from "next";
import { ForgotForm } from "@/ui/spaces/AuthForms";

export const metadata: Metadata = { title: "Recuperar · StereoFace Spaces", robots: { index: false } };

export default function Page() {
  return <ForgotForm  />;
}
