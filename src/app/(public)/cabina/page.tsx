import type { Metadata } from "next";
import { CabinStage } from "@/ui/cabin/CabinStage";

export const metadata: Metadata = {
  title: "Cabina en vivo",
  description: "La cabina de StereoFace Radio en video, sin audio: el sonido es el de la radio.",
};

export default function CabinPage() {
  return (
    <div className="wrap py-10 sm:py-14">
      <p className="mono text-accent-ink">StereoFace Radio</p>
      <h1 className="display-up text-[clamp(2.2rem,6vw,4rem)] leading-none">Cabina</h1>
      <div className="mt-8">
        <CabinStage />
      </div>
    </div>
  );
}
