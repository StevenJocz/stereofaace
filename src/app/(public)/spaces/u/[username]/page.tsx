import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { getPublicSpace } from "@/modules/spaces/public";
import { SpaceView } from "@/ui/spaces/SpaceView";
import { Sk } from "@/ui/Skeleton";

type Params = { username: string };
type Search = { vista?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const { username } = await params;
  const s = await getPublicSpace(await getDb(), username, null);
  if (!s) return { title: "No encontrado · StereoFace", robots: { index: false } };
  const description = s.bio?.slice(0, 160) ?? `El Space de @${s.username} en StereoFace: su identidad musical.`;
  return {
    title: `@${s.username} · StereoFace Spaces`,
    description,
    alternates: { canonical: `${SITE_URL}/@${s.username}` },
    robots: s.listed ? undefined : { index: false },
    openGraph: { title: `@${s.username}`, description, url: `${SITE_URL}/@${s.username}`, siteName: "StereoFace" },
  };
}

async function View({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  await connection();
  const { username } = await params;
  const sp = await searchParams;
  const viewer = await getCurrentUser();
  // El dueño puede ver su borrador con ?vista=borrador; el resto, solo lo publicado.
  const s = await getPublicSpace(await getDb(), username, viewer ? { id: viewer.id } : null, { preview: sp.vista === "borrador" });
  if (!s) notFound();
  return <SpaceView space={s} viewerIsStaff={Boolean(viewer && viewer.role !== "oyente")} />;
}

export default function SpacePage(props: { params: Promise<Params>; searchParams: Promise<Search> }) {
  return (
    <Suspense
      fallback={
        <div className="wrap pt-10" aria-busy="true">
          <Sk className="w-full" style={{ height: "14rem", borderRadius: 12 }} />
          <Sk className="mt-6 h-10 w-64" />
        </div>
      }
    >
      <View {...props} />
    </Suspense>
  );
}
