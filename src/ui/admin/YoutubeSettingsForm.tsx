"use client";

import { useActionState } from "react";
import { disconnectYouTubeAction, setPrivacyAction } from "@/app/(admin)/admin/(panel)/ajustes/youtube/actions";
import type { FormState } from "@/lib/admin/form";
import { Message } from "./fields";

export function YoutubeSettingsForm({ connected, channelTitle, privacy, envMissing }: { connected: boolean; channelTitle: string | null; privacy: "unlisted" | "public"; envMissing: string[] }) {
  const [pState, pAction, pPending] = useActionState<FormState, FormData>(setPrivacyAction, null);
  const [dState, dAction, dPending] = useActionState<FormState, FormData>(disconnectYouTubeAction, null);
  return (
    <div className="grid max-w-2xl gap-8">
      {envMissing.length > 0 && (
        <p role="alert" className="mono text-[#ffb020]">
          Faltan variables de entorno en el servidor: {envMissing.join(", ")}. Mira DEPLOY.md → «Cámara en cabina».
        </p>
      )}
      <div className="panel grid gap-3 p-5">
        <p className="mono text-muted">Canal</p>
        {connected ? <p className="display-up text-[1.3rem]">{channelTitle}</p> : <p className="muted">Sin conectar.</p>}
        <div className="flex flex-wrap items-center gap-3">
          {/* Enlace normal (no acción): Google devuelve a /api/youtube/oauth/callback con un estado de un solo uso. */}
          <a className={`btn ${connected ? "" : "btn-accent"}`} href="/api/youtube/oauth/start" aria-disabled={envMissing.length > 0} tabIndex={envMissing.length > 0 ? -1 : undefined}>
            {connected ? "Reconectar con Google" : "Conectar canal de YouTube"}
          </a>
          {connected && (
            <form key={dState?.nonce ?? "d"} action={dAction}>
              <button type="submit" className="btn" disabled={dPending}>
                Desconectar y revocar
              </button>
            </form>
          )}
          <Message state={dState} />
        </div>
      </div>
      {connected && (
        <form key={pState?.nonce ?? "p"} action={pAction} className="panel grid gap-3 p-5">
          <fieldset className="grid gap-2">
            <legend className="mono mb-1 text-muted">Privacidad de los directos nuevos</legend>
            <label className="flex items-center gap-2">
              <input type="radio" name="privacy" value="unlisted" defaultChecked={privacy === "unlisted"} />
              <span>No listado (recomendado): solo se ve por el enlace o en el sitio.</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="privacy" value="public" defaultChecked={privacy === "public"} />
              <span>Público: aparece en el canal y en las búsquedas de YouTube.</span>
            </label>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-accent !px-4 !py-2" disabled={pPending}>
              Guardar privacidad
            </button>
            <Message state={pState} />
          </div>
        </form>
      )}
    </div>
  );
}
