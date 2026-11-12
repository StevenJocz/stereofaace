/** Protocolo «webcast» del WebDJ de AzuraCast y emisor con reconexión. Sin globales del navegador: todo se inyecta. */
export const WEBCAST_URL = "wss://radio.stereoface.online/webdj/stereo_face/";
export const WEBCAST_MIME = "audio/webm;codecs=opus";

const BITRATE = 128_000;
const CHUNK_MS = 1000;
const LIVE_AFTER_MS = 1500;
const METADATA_DELAY_MS = 1000;
const MAX_FIELD = 200;

export type LiveState = "offline" | "connecting" | "live" | "reconnecting" | "auth-error" | "error";

export type Credentials = { user: string; password: string };
export type TrackMetadata = { title: string; artist: string };

export function helloMessage(creds: Credentials, mime: string): string {
  return JSON.stringify({ type: "hello", data: { mime, user: creds.user, password: creds.password } });
}

export function metadataMessage(m: TrackMetadata): string {
  return JSON.stringify({
    type: "metadata",
    data: { title: m.title.slice(0, MAX_FIELD), artist: m.artist.slice(0, MAX_FIELD) },
  });
}

/** Espera antes del intento número `attempt` (0 = primero): 1, 2, 4, 8 s y tope de 15 s. */
export function nextBackoffMs(attempt: number): number {
  return Math.min(15_000, 1000 * 2 ** Math.max(0, attempt));
}

export interface SocketLike {
  readyState: number;
  send(data: string | ArrayBuffer): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: ((e: { code: number; reason: string }) => void) | null;
  onerror: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export interface RecorderLike {
  state: string;
  start(timesliceMs: number): void;
  stop(): void;
  ondataavailable: ((e: { data: { arrayBuffer(): Promise<ArrayBuffer> } }) => void) | null;
}

export type WebcastOptions = {
  url: string;
  creds: Credentials;
  mime: string;
  stream: MediaStream;
  createSocket: (url: string, protocol: string) => SocketLike;
  createRecorder: (stream: MediaStream, opts: { mimeType: string; audioBitsPerSecond: number }) => RecorderLike;
  onState: (state: LiveState) => void;
};

const OPEN = 1;

export class WebcastSender {
  private state: LiveState = "offline";
  private socket: SocketLike | null = null;
  private recorder: RecorderLike | null = null;
  private metadata: TrackMetadata | null = null;
  private attempt = 0;
  private stopping = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private readonly o: WebcastOptions) {}

  start(): void {
    if (this.state !== "offline" && this.state !== "auth-error" && this.state !== "error") return;
    this.stopping = false;
    this.attempt = 0;
    this.connect("connecting");
  }

  stop(): void {
    this.stopping = true;
    this.clearTimers();
    this.teardown();
    this.setState("offline");
  }

  setMetadata(m: TrackMetadata): void {
    this.metadata = m;
    if (this.socket && this.socket.readyState === OPEN) this.socket.send(metadataMessage(m));
  }

  private setState(s: LiveState) {
    if (this.state === s) return;
    this.state = s;
    this.o.onState(s);
  }

  private later(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private teardown() {
    const rec = this.recorder;
    const sock = this.socket;
    this.recorder = null;
    this.socket = null;
    if (rec) {
      rec.ondataavailable = null;
      if (rec.state !== "inactive") rec.stop();
    }
    if (sock) {
      sock.onopen = sock.onclose = sock.onerror = sock.onmessage = null;
      if (sock.readyState < 2) sock.close();
    }
  }

  private connect(state: "connecting" | "reconnecting") {
    this.setState(state);
    const socket = this.o.createSocket(this.o.url, "webcast");
    this.socket = socket;
    socket.onopen = () => {
      socket.send(helloMessage(this.o.creds, this.o.mime));
      const rec = this.o.createRecorder(this.o.stream, { mimeType: this.o.mime, audioBitsPerSecond: BITRATE });
      rec.ondataavailable = async (e) => {
        const buf = await e.data.arrayBuffer();
        if (this.socket === socket && socket.readyState === OPEN) socket.send(buf);
      };
      this.recorder = rec;
      rec.start(CHUNK_MS);
      this.later(() => {
        if (this.socket === socket && socket.readyState === OPEN && this.metadata) {
          socket.send(metadataMessage(this.metadata));
        }
      }, METADATA_DELAY_MS);
      this.later(() => {
        if (this.socket === socket && socket.readyState === OPEN) {
          this.attempt = 0;
          this.setState("live");
        }
      }, LIVE_AFTER_MS);
    };
    socket.onclose = (e) => {
      if (this.stopping || this.socket !== socket) return;
      this.clearTimers();
      this.teardown();
      if (/authentication/i.test(e.reason)) {
        this.setState("auth-error");
        return;
      }
      this.setState("reconnecting");
      const wait = nextBackoffMs(this.attempt++);
      this.later(() => {
        if (!this.stopping) this.connect("reconnecting");
      }, wait);
    };
    socket.onerror = () => {
      // El cierre posterior decide el estado; el error solo evita excepciones sin atender.
    };
  }
}
