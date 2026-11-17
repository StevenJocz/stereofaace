import {
  AccessToken,
  EgressClient,
  EgressStatus,
  EncodingOptionsPreset,
  RoomServiceClient,
  StreamOutput,
  StreamProtocol,
  TrackSource,
  TrackType,
} from "livekit-server-sdk";
import { DomainError } from "@/lib/errors";
import { ROOM, validateIngestUrl, type EgressState, type MediaGateway } from "./gateway";

export const TOKEN_TTL_SECONDS = 120;
const unavailable = () => new DomainError("media_unavailable", "El servicio de video (LiveKit) no responde. Avisa a quien administra el servidor.");

export type LiveKitConfig = { url: string; apiKey: string; apiSecret: string };

/** LiveKit Cloud: la API HTTPS vive en el mismo host que el WebSocket. */
export const apiUrlOf = (wsUrl: string) => wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:").replace(/\/$/, "");

export class LiveKitGateway implements MediaGateway {
  private readonly rooms: RoomServiceClient;
  private readonly egress: EgressClient;
  constructor(private readonly cfg: LiveKitConfig) {
    const api = apiUrlOf(cfg.url);
    this.rooms = new RoomServiceClient(api, cfg.apiKey, cfg.apiSecret);
    this.egress = new EgressClient(api, cfg.apiKey, cfg.apiSecret);
  }

  async mintPublishToken(identity: string, name: string) {
    const t = new AccessToken(this.cfg.apiKey, this.cfg.apiSecret, { identity, name, ttl: TOKEN_TTL_SECONDS });
    t.addGrant({
      room: ROOM,
      roomJoin: true,
      canPublish: true,
      canSubscribe: false,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      // Solo cámara: LiveKit rechaza cualquier micrófono o audio de pantalla aunque el navegador lo intentara.
      canPublishSources: [TrackSource.CAMERA],
      roomAdmin: false,
      roomCreate: false,
      roomList: false,
      roomRecord: false,
    });
    return { url: this.cfg.url, token: await t.toJwt() };
  }

  async ensureRoom() {
    try {
      await this.rooms.createRoom({ name: ROOM, emptyTimeout: 60, departureTimeout: 15, maxParticipants: 2 });
    } catch {
      throw unavailable();
    }
  }

  async publisherLive() {
    try {
      const people = await this.rooms.listParticipants(ROOM);
      return people.some((p) => p.tracks.some((t) => t.type === TrackType.VIDEO));
    } catch {
      return false;
    }
  }

  async startEgress(ingestUrl: string) {
    const url = validateIngestUrl(ingestUrl);
    try {
      const info = await this.egress.startRoomCompositeEgress(
        ROOM,
        new StreamOutput({ protocol: StreamProtocol.RTMP, urls: [url] }),
        { layout: "single-speaker", encodingOptions: EncodingOptionsPreset.H264_720P_30, videoOnly: true }, // solo video: la cámara nunca lleva audio
      );
      return info.egressId;
    } catch {
      throw new DomainError("media_unavailable", "LiveKit no pudo iniciar el envío a YouTube. Revisa el plan y los límites de la cuenta de LiveKit.");
    }
  }

  async egressState(egressId: string): Promise<EgressState> {
    try {
      const [info] = await this.egress.listEgress({ egressId });
      if (!info) return "ended";
      switch (info.status) {
        case EgressStatus.EGRESS_STARTING:
          return "starting";
        case EgressStatus.EGRESS_ACTIVE:
          return "active";
        case EgressStatus.EGRESS_ENDING:
          return "ending";
        case EgressStatus.EGRESS_COMPLETE:
          return "ended";
        default:
          return "failed";
      }
    } catch {
      throw unavailable();
    }
  }

  async stop(egressId: string | null) {
    if (egressId) await this.egress.stopEgress(egressId).catch(() => undefined);
    await this.rooms.deleteRoom(ROOM).catch(() => undefined);
  }
}
