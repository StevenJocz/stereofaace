import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { createMailer } from "@/modules/spaces/mailer";
import { getMySpace } from "@/modules/spaces/profile";
import { SpaceStudio } from "@/ui/spaces/SpaceStudio";
import { logoutAction } from "./actions";

/** Editor o asistente: solo con sesión y un Space propio; si no, a entrar o a crear la cuenta. */
export async function StudioPage({ mode }: { mode: "wizard" | "editor" }) {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/spaces/entrar");
  let initial;
  try {
    initial = await getMySpace(await getDb(), user.id);
  } catch (e) {
    if (e instanceof DomainError && e.code === "no_profile") redirect("/spaces/registro"); // personal del administrador sin Space
    throw e;
  }
  return <SpaceStudio initial={initial} mode={mode} mailConfigured={createMailer().configured} logout={logoutAction} />;
}
