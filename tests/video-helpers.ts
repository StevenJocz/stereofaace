import { DomainError } from "@/lib/errors";
import type { EgressState } from "@/modules/video/gateway";
import type { BroadcastLife, StreamHealth } from "@/modules/video/youtube";
import type { VideoDeps } from "@/modules/video/service";

export const INGEST = "rtmp://a.rtmp.youtube.com/live2/SECRET-STREAM-KEY-123";

/** YouTube y LiveKit simulados: ningún directo real durante las pruebas. */
export function fakeDeps(now: () => Date = () => new Date()) {
  const log: string[] = [];
  const st = {
    health: "inactive" as StreamHealth,
    life: "ready" as BroadcastLife,
    publisher: false,
    egress: "active" as EgressState,
    egressUrl: "",
    failRoom: false,
  };
  const deps: VideoDeps = {
    youtube: {
      ensureStream: async () => ({ id: "S1", ingestUrl: INGEST }),
      createBroadcast: async (o) => {
        log.push(`create:${o.privacy}`);
        return "BROADCAST01";
      },
      bind: async (b, s) => void log.push(`bind:${b}:${s}`),
      streamHealth: async () => st.health,
      broadcastLife: async () => st.life,
      transition: async (_id, to) => {
        log.push(`transition:${to}`);
        st.life = to === "testing" ? "testing" : to === "live" ? "live" : "complete";
      },
    },
    media: {
      mintPublishToken: async () => ({ url: "wss://demo.livekit.cloud", token: "JWT-DE-PRUEBA" }),
      ensureRoom: async () => {
        if (st.failRoom) throw new DomainError("media_unavailable", "El servicio de video (LiveKit) no responde. Avisa a quien administra el servidor.");
        log.push("room");
      },
      publisherLive: async () => st.publisher,
      startEgress: async (url) => {
        log.push("egress:start");
        st.egressUrl = url;
        st.egress = "active";
        return "EG_1";
      },
      egressState: async () => st.egress,
      stop: async () => {
        log.push("media:stop");
        st.egress = "ended";
      },
    },
    now,
  };
  return { deps, log, st };
}
