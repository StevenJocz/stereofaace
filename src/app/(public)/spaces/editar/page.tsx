import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/ui/Skeleton";
import { StudioPage } from "../studio-page";

export const metadata: Metadata = { title: "Editar mi Space · StereoFace Spaces", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <StudioPage mode="editor" />
    </Suspense>
  );
}
