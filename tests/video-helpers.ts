import type { BroadcastLife, StreamHealth } from "@/modules/video/youtube";
import type { VideoDeps } from "@/modules/video/service";

export const INGEST = "rtmp://a.rtmp.youtube.com/live2/SECRET-STREAM-KEY-123";
export const OFFER = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n";
export const ANSWER = "v=0\r\ns=answer\r\n";

/** YouTube, relay y MediaMTX simulados: ningún directo real durante las pruebas. */
export function fakeDeps(now: () => Date = () => new Date()) {
  const log: string[] = [];
  const st = { health: "inactive" as StreamHealth, life: "ready" as BroadcastLife, relayRunning: false, relayError: undefined as string | undefined, relayUrl: "" , failWhip: false };
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
    relay: {
      start: async (u) => {
        log.push("relay:start");
        st.relayUrl = u;
        st.relayRunning = true;
      },
      stop: async () => {
        log.push("relay:stop");
        st.relayRunning = false;
      },
      status: async () => ({ running: st.relayRunning, ...(st.relayError ? { error: st.relayError } : {}) }),
    },
    whip: async () => {
      if (st.failWhip) throw new Error("x");
      return ANSWER;
    },
    now,
  };
  return { deps, log, st };
}
