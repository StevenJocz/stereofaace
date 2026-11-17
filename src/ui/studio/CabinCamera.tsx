"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoAdminView } from "@/modules/video/service";
import { apiErrorMessage, cameraErrorMessage } from "./cabin-errors";

type Cam = { deviceId: string; label: string };
type Cached = VideoAdminView | null;

const ICE = [{ urls: "stun:stun.l.google.com:19302" }];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch {
    throw new Error(apiErrorMessage(0, null));
  }
  if (!res.ok) throw new Error(apiErrorMessage(res.status, (await res.json().catch(() => null)) as { error?: string } | null));
  return (await res.json()) as T;
}

/** Espera a que el navegador termine de reunir candidatos ICE (la señalización WHIP va en una sola oferta). */
function iceComplete(pc: RTCPeerConnection, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(t);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const t = setTimeout(done, ms);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * Cámara en cabina. Solo VIDEO: `getUserMedia({ audio: false })`, sin micrófono ni audio del sistema. La cámara se pide
 * únicamente al pulsar «Activar cámara». El video viaja por WebRTC (WHIP) al servidor, que lo reenvía a YouTube.
 */
export function CabinCamera({ compact = false, onActive }: { compact?: boolean; onActive?: (active: boolean) => void }) {
  const videoEl = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const [cams, setCams] = useState<Cam[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [view, setView] = useState<Cached>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const state = view?.session?.state ?? null;
  const active = state !== null && state !== "ended" && state !== "error";

  // Avisa al estudio si hay video en directo (para marcar la pestaña «Cámara»).
  useEffect(() => {
    onActive?.(active);
  }, [active, onActive]);

  const closePeer = useCallback(() => {
    pc.current?.close();
    pc.current = null;
    setSending(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setView(await api<VideoAdminView>("/api/studio/video"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el estado.");
    }
  }, []);

  // Estado del directo: rápido mientras hay transmisión, lento en reposo.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (alive) timer = setTimeout(loop, active ? 2500 : 15_000);
    };
    void loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refresh, active]);

  // Si el servidor da por terminado el directo (error o fin), se cierra la conexión del navegador.
  useEffect(() => {
    if ((state === "ended" || state === "error") && pc.current) closePeer();
  }, [state, closePeer]);

  const stopCamera = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoEl.current) videoEl.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const openCamera = useCallback(async (id?: string) => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { ...(id ? { deviceId: { exact: id } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: false, // jamás micrófono ni audio del sistema
      });
      const track = s.getVideoTracks()[0];
      // Con una transmisión en curso se cambia la fuente sin cortar el directo.
      const sender = pc.current?.getSenders().find((x) => x.track?.kind === "video");
      if (sender) await sender.replaceTrack(track);
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      if (videoEl.current) videoEl.current.srcObject = s;
      setCameraOn(true);
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setCams(all.map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Cámara ${i + 1}` })));
      setDeviceId(track.getSettings().deviceId ?? id ?? "");
    } catch (e) {
      setCameraOn(false);
      setError(cameraErrorMessage(e));
    }
  }, []);

  const start = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return setError("Activa la cámara antes de iniciar la transmisión.");
    setBusy(true);
    setError(null);
    try {
      const { ticket } = await api<{ ticket: string }>("/api/studio/video/start", { method: "POST" });
      const peer = new RTCPeerConnection({ iceServers: ICE });
      pc.current = peer;
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          setError("Se perdió la conexión de la cámara con el servidor. Finaliza y vuelve a iniciar.");
        }
      };
      peer.addTransceiver(track, { direction: "sendonly", streams: [stream.current!] }); // solo video
      await peer.setLocalDescription(await peer.createOffer());
      await iceComplete(peer, 4000);
      const res = await fetch("/api/studio/video/whip", {
        method: "POST",
        headers: { "content-type": "application/sdp", authorization: `Bearer ${ticket}` },
        body: peer.localDescription!.sdp,
      }).catch(() => {
        throw new Error(apiErrorMessage(0, null));
      });
      if (!res.ok) throw new Error(apiErrorMessage(res.status, (await res.json().catch(() => null)) as { error?: string } | null));
      await peer.setRemoteDescription({ type: "answer", sdp: await res.text() });
      setSending(true);
      try {
        const sender = peer.getSenders()[0];
        const p = sender.getParameters();
        if (p.encodings?.[0]) {
          p.encodings[0].maxBitrate = 2_500_000;
          await sender.setParameters(p);
        }
      } catch {
        /* el navegador decide el bitrate */
      }
      await refresh();
    } catch (e) {
      closePeer();
      setError(e instanceof Error ? e.message : "No se pudo iniciar la transmisión.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      closePeer();
      setView(await api<VideoAdminView>("/api/studio/video/stop", { method: "POST" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo finalizar.");
    } finally {
      setBusy(false);
    }
  }, [closePeer]);

  // Al salir de la página, o cerrar la pestaña, la transmisión termina (la cámara no puede seguir sin esta pestaña).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pc.current) e.preventDefault();
    };
    const end = () => {
      if (pc.current) void fetch("/api/studio/video/stop", { method: "POST", keepalive: true }).catch(() => undefined);
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("pagehide", end);
      end();
      pc.current?.close();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const notReady = view && (view.envMissing.length > 0 || !view.connected);
  const label = view?.session?.label ?? "Fuera del aire";

  return (
    <div className={compact ? "cabin-admin cabin-admin--compact" : "cabin-admin"}>
      <section className="panel p-4 sm:p-5" aria-label="Previsualización">
        <div className="cabin-preview">
          <video ref={videoEl} autoPlay muted playsInline aria-label="Previsualización de la cámara (sin audio)" />
          {!cameraOn && (
            <div className="cabin-preview-empty">
              <p className="mono muted">La cámara está apagada. Pulsa «Activar cámara» y autoriza el navegador.</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {!cameraOn ? (
            <button type="button" className="btn btn-accent" onClick={() => void openCamera(deviceId || undefined)} disabled={busy}>
              Activar cámara
            </button>
          ) : (
            <button type="button" className="btn" onClick={stopCamera} disabled={sending || busy}>
              Apagar cámara
            </button>
          )}
          {cams.length > 1 && (
            <label className="block">
              <span className="mono muted block">Cámara</span>
              <select className="input !py-1.5" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); void openCamera(e.target.value); }}>
                {cams.map((c) => (
                  <option key={c.deviceId} value={c.deviceId}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      <section className="panel grid content-start gap-4 p-4 sm:p-5" aria-label="Transmisión">
        <p className="cabin-state mono" data-state={state ?? "idle"} role="status" aria-live="polite">
          {state === "live" && <span className="cabin-dot" aria-hidden="true" />}
          {state === "live" ? "EN VIVO" : label}
        </p>
        <div className="flex flex-wrap gap-3">
          {!active ? (
            <button type="button" className="btn btn-accent" onClick={() => void start()} disabled={busy || !cameraOn || Boolean(notReady)}>
              Iniciar transmisión
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void stop()} disabled={busy || state === "ending"}>
              Finalizar transmisión
            </button>
          )}
        </div>
        {notReady && (
          <p className="mono muted" role="note">
            {view!.envMissing.length > 0
              ? `El servidor de video no está configurado todavía (faltan: ${view!.envMissing.join(", ")}).`
              : "El canal de YouTube aún no está conectado. Un superadministrador debe conectarlo en Ajustes → YouTube."}
          </p>
        )}
        {view?.session?.error && state === "error" && (
          <p role="alert" className="mono text-[#ff8a8a]">
            {view.session.error}
          </p>
        )}
        {error && (
          <p role="alert" className="mono text-[#ff8a8a]">
            {error}
          </p>
        )}
        <ul className="mono muted grid gap-1 text-[0.72rem]">
          <li>Solo video: no se usa micrófono. El audio del directo es el de la radio.</li>
          <li>Privacidad de los directos: {view?.privacy === "public" ? "pública" : "no listada"}.</li>
          <li>No cierres esta pestaña mientras transmites: al salir, la transmisión termina.</li>
        </ul>
      </section>
    </div>
  );
}
