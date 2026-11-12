import type { Metadata } from "next";

// El panel no debe indexarse ni aparecer en buscadores.
export const metadata: Metadata = {
  title: "StereoFace · Administración",
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
