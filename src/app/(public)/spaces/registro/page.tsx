import type { Metadata } from "next";
import { RegisterForm } from "@/ui/spaces/AuthForms";

export const metadata: Metadata = { title: "Registro · StereoFace Spaces", robots: { index: false } };

export default function Page() {
  return <RegisterForm  />;
}
