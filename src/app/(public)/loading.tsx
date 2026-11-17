import { PageSkeleton } from "@/ui/Skeleton";

/** Mientras llega el contenido de cualquier página pública, se ve su esqueleto en vez de un vacío. */
export default function Loading() {
  return <PageSkeleton />;
}
