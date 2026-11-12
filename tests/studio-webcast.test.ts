import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  WEBCAST_MIME,
  WEBCAST_URL,
  WebcastSender,
  helloMessage,
  metadataMessage,
  nextBackoffMs,
  type LiveState,
  type RecorderLike,
  type SocketLike,
} from "@/ui/studio/engine/webcast";

class FakeSocket implements SocketLike {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: (string | ArrayBuffer)[] = [];
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(
    public url: string,
    public protocol: string,
  ) {
    FakeSocket.all.push(this);
  }
  send(d: string | ArrayBuffer) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000, reason: "" });
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  serverClose(code: number, reason: string) {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

class FakeRecorder implements RecorderLike {
  static all: FakeRecorder[] = [];
  state = "inactive";
  timeslice = 0;
  ondataavailable: ((e: { data: { arrayBuffer(): Promise<ArrayBuffer> } }) => void) | null = null;
  constructor(
    public stream: unknown,
    public opts: { mimeType: string; audioBitsPerSecond: number },
  ) {
    FakeRecorder.all.push(this);
  }
  start(t: number) {
    this.state = "recording";
    this.timeslice = t;
  }
  stop() {
    this.state = "inactive";
  }
  emit(bytes: number) {
    this.ondataavailable?.({ data: { arrayBuffer: async () => new ArrayBuffer(bytes) } });
  }
}

function make() {
  const states: LiveState[] = [];
  const sender = new WebcastSender({
    url: WEBCAST_URL,
    creds: { user: "dj1", password: "x" },
    mime: WEBCAST_MIME,
    stream: {} as MediaStream,
    createSocket: (u, p) => new FakeSocket(u, p),
    createRecorder: (s, o) => new FakeRecorder(s, o),
    onState: (s) => states.push(s),
  });
  return { sender, states };
}

beforeEach(() => {
  FakeSocket.all = [];
  FakeRecorder.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("mensajes del protocolo", () => {
  it("helloMessage lleva mime, usuario y contraseña", () => {
    expect(JSON.parse(helloMessage({ user: "dj1", password: "x" }, WEBCAST_MIME))).toEqual({
      type: "hello",
      data: { mime: "audio/webm;codecs=opus", user: "dj1", password: "x" },
    });
  });

  it("metadataMessage recorta a 200 caracteres y sigue siendo JSON válido con Unicode", () => {
    const long = JSON.parse(metadataMessage({ title: "t".repeat(500), artist: "a" }));
    expect(long.data.title).toHaveLength(200);
    const uni = JSON.parse(metadataMessage({ title: "Señal ñandú — 日本語", artist: "Ōkami" }));
    expect(uni.data).toEqual({ title: "Señal ñandú — 日本語", artist: "Ōkami" });
  });

  it("nextBackoffMs duplica y topa en 15 s", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(nextBackoffMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
  });
});

describe("WebcastSender", () => {
  it("dos start() seguidos abren un solo socket", () => {
    const { sender } = make();
    sender.start();
    sender.start();
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].protocol).toBe("webcast");
  });

  it("al abrir envía hello y arranca el grabador cada 1000 ms", () => {
    const { sender, states } = make();
    sender.start();
    FakeSocket.all[0].open();
    expect(JSON.parse(FakeSocket.all[0].sent[0] as string).type).toBe("hello");
    expect(FakeRecorder.all[0].timeslice).toBe(1000);
    expect(FakeRecorder.all[0].opts).toEqual({ mimeType: WEBCAST_MIME, audioBitsPerSecond: 128000 });
    expect(states).toEqual(["connecting"]);
  });

  it("pasa a live si el servidor no cierra en 1,5 s", () => {
    const { sender, states } = make();
    sender.start();
    FakeSocket.all[0].open();
    vi.advanceTimersByTime(1500);
    expect(states.at(-1)).toBe("live");
    sender.stop();
  });

  it("publica el metadato guardado 1 s después del hello", () => {
    const { sender } = make();
    sender.setMetadata({ title: "Tema", artist: "Banda" });
    sender.start();
    const s = FakeSocket.all[0];
    s.open();
    expect(s.sent).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(JSON.parse(s.sent[1] as string)).toEqual({ type: "metadata", data: { title: "Tema", artist: "Banda" } });
  });

  it("un cierre inesperado reconecta tras 1000 ms", () => {
    const { sender, states } = make();
    sender.start();
    FakeSocket.all[0].open();
    vi.advanceTimersByTime(1500);
    FakeSocket.all[0].serverClose(1006, "");
    expect(states.at(-1)).toBe("reconnecting");
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("«Authentication failed.» deja auth-error y no reintenta", () => {
    const { sender, states } = make();
    sender.start();
    FakeSocket.all[0].open();
    FakeSocket.all[0].serverClose(1011, "Authentication failed.");
    expect(states.at(-1)).toBe("auth-error");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeRecorder.all[0].state).toBe("inactive");
  });

  it("tras auth-error se puede volver a intentar con start()", () => {
    const { sender } = make();
    sender.start();
    FakeSocket.all[0].open();
    FakeSocket.all[0].serverClose(1011, "Authentication failed.");
    sender.start();
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("stop() no reintenta y deja offline", () => {
    const { sender, states } = make();
    sender.start();
    FakeSocket.all[0].open();
    sender.stop();
    vi.advanceTimersByTime(60_000);
    expect(states.at(-1)).toBe("offline");
    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeRecorder.all[0].state).toBe("inactive");
  });

  it("solo envía binarios mientras el socket está abierto", async () => {
    const { sender } = make();
    sender.start();
    const s = FakeSocket.all[0];
    s.open();
    FakeRecorder.all[0].emit(10);
    await Promise.resolve();
    await Promise.resolve();
    expect(s.sent.filter((d) => typeof d !== "string")).toHaveLength(1);
    s.readyState = 3;
    FakeRecorder.all[0].emit(10);
    await Promise.resolve();
    await Promise.resolve();
    expect(s.sent.filter((d) => typeof d !== "string")).toHaveLength(1);
  });
});
