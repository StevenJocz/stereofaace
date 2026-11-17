import type { Metadata } from "next";
import { NotFoundView } from "@/ui/NotFoundView";

export const metadata: Metadata = { title: "404 · Señal perdida", robots: { index: false, follow: false } };

/** Para `notFound()` dentro del portal (artículos, artistas…): el layout público ya pone cabecera y pie. */
export default function NotFound() {
  return <NotFoundView />;
}
