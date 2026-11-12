import { LoadGate } from "./autoplay";
import { equalPowerGains, FadeGeneration } from "./crossfade";
import { EQ_BANDS, FLAT_EQ, clampEq, type EqSettings } from "./eq";
import { peakToDb, rmsToDb } from "./meter";
import { DEFAULT_DUCK, DuckController, GateController, dbToGain, gainToDb, type DuckSettings } from "./voice";
import type { QueueItem } from "./queue";

export type DeckId = "A" | "B";
const other = (d: DeckId): DeckId => (d === "A" ? "B" : "A");

type Deck = {
  el: HTMLAudioElement | null;
  source: MediaElementAudioSourceNode | null;
  objectUrl: string | null;
  item: QueueItem | null;
  volume: GainNode; // volumen elegido por el DJ
  fade: GainNode; // crossfade
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
};

export type Levels = { master: { rmsDb: number; peakDb: number }; A: number; B: number };

const CURVE_POINTS = 64;
const CONTROL_MS = 30;

type MicChain = {
  stream: MediaStream;
  nodes: AudioNode[];
  gate: GainNode;
  gain: GainNode;
  eq: BiquadFilterNode[];
  analyser: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
};

/** Una carga fue reemplazada por otra más reciente en el mismo deck; no es un error para el usuario. */
export class LoadSupersededError extends Error {
  constructor() {
    super("Carga reemplazada por otra más reciente.");
    this.name = "LoadSupersededError";
  }
}

/**
 * Grafo de audio del estudio (solo navegador):
 * deck → volumen → fundido → analizador → bus → limitador → master → [analizador | destino de emisión | monitor].
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  private decks: Record<DeckId, Deck>;
  private gates: Record<DeckId, LoadGate> = { A: new LoadGate(), B: new LoadGate() };
  private mix: GainNode;
  private limiter: DynamicsCompressorNode;
  private master: GainNode;
  private masterAnalyser: AnalyserNode;
  private masterBuf: Float32Array<ArrayBuffer>;
  private dest: MediaStreamAudioDestinationNode;
  private monitor: GainNode;
  private musicBus: GainNode;
  private musicEq: BiquadFilterNode[];
  private duckGain: GainNode;
  private mic: MicChain | null = null;
  private micMuted = false;
  private micGain = 1;
  private pendingMicEq: EqSettings = FLAT_EQ;
  private gateCtl = new GateController(-55);
  private duckCtl = new DuckController(DEFAULT_DUCK);
  private duckDb = 0;
  private micDb = -100;
  private controlTimer: ReturnType<typeof setInterval> | null = null;
  private cartBus: GainNode;
  private cartBuffers = new Map<string, AudioBuffer>();
  private cartPlaying = new Map<string, { src: AudioBufferSourceNode; duck: boolean; endsAt: number }>();
  private manualForce = false;
  private fadeTimers = new Set<ReturnType<typeof setTimeout>>();
  private fadeGen = new FadeGeneration();

  onDeckEnded: ((deck: DeckId) => void) | null = null;
  onDeckTime: ((deck: DeckId, current: number, duration: number) => void) | null = null;
  onMicLost: (() => void) | null = null;
  onCartEnded: ((id: string) => void) | null = null;

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    this.mix = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.12;
    this.master = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterBuf = new Float32Array(this.masterAnalyser.fftSize);
    this.dest = this.ctx.createMediaStreamDestination();
    this.dest.channelCount = 2;
    this.monitor = this.ctx.createGain();
    // Música: decks → bus → EQ de 3 bandas → ducker → mezcla.
    this.musicBus = this.ctx.createGain();
    this.musicEq = EQ_BANDS.map((b) => this.biquad(b.type, b.frequency, b.q));
    this.duckGain = this.ctx.createGain();
    let prev: AudioNode = this.musicBus;
    for (const f of this.musicEq) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(this.duckGain);
    this.duckGain.connect(this.mix);
    // Carts (jingles, promos…): van directo a la mezcla, sin pasar por el ducker de la música.
    this.cartBus = this.ctx.createGain();
    this.cartBus.connect(this.mix);
    this.mix.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.masterAnalyser);
    this.master.connect(this.dest);
    this.master.connect(this.monitor);
    this.monitor.connect(this.ctx.destination);
    this.decks = { A: this.makeDeck(), B: this.makeDeck() };
    this.decks.B.fade.gain.value = 0;
  }

  private biquad(type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  private makeDeck(): Deck {
    const volume = this.ctx.createGain();
    const fade = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    volume.connect(fade);
    fade.connect(analyser);
    analyser.connect(this.musicBus);
    return {
      el: null,
      source: null,
      objectUrl: null,
      item: null,
      volume,
      fade,
      analyser,
      buf: new Float32Array(analyser.fftSize),
    };
  }

  /** Debe llamarse desde un gesto del usuario. Falla con un mensaje claro si el navegador sigue bloqueando el audio. */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (this.ctx.state !== "running") throw new Error("El navegador bloqueó el audio. Pulsa de nuevo o revisa los permisos del sitio.");
  }

  get stream(): MediaStream {
    return this.dest.stream;
  }

  private release(d: Deck) {
    if (d.el) {
      d.el.pause();
      d.el.removeAttribute("src");
      d.el.load();
    }
    d.source?.disconnect();
    if (d.objectUrl) URL.revokeObjectURL(d.objectUrl);
    d.el = d.source = null;
    d.objectUrl = null;
    d.item = null;
  }

  async loadDeck(id: DeckId, item: QueueItem): Promise<{ durationSec: number | null }> {
    const d = this.decks[id];
    const token = this.gates[id].next();
    this.release(d);
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    let objectUrl: string | null = null;
    // Libera el elemento local de ESTA carga (no el del deck): detiene la descarga y revoca su URL.
    const dispose = () => {
      el.pause();
      el.removeAttribute("src");
      el.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    let src: string;
    if (item.file) {
      objectUrl = URL.createObjectURL(item.file);
      src = objectUrl;
    } else if (item.url) {
      src = item.url;
    } else {
      throw new Error("La pista no tiene archivo ni dirección de audio.");
    }
    el.src = src;
    const duration = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("La pista tardó demasiado en cargar.")), 15_000);
      el.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(timer);
          resolve(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
        },
        { once: true },
      );
      el.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("No se pudo leer el audio de esta pista."));
        },
        { once: true },
      );
    }).catch((e) => {
      dispose();
      throw e;
    });
    if (!this.gates[id].isCurrent(token)) {
      dispose();
      throw new LoadSupersededError();
    }
    d.el = el;
    d.objectUrl = objectUrl;
    d.item = item;
    d.source = this.ctx.createMediaElementSource(el);
    d.source.connect(d.volume);
    el.addEventListener("ended", () => this.onDeckEnded?.(id));
    el.addEventListener("timeupdate", () => this.onDeckTime?.(id, el.currentTime, Number.isFinite(el.duration) ? el.duration : 0));
    return { durationSec: duration };
  }

  isPlaying(id: DeckId): boolean {
    const el = this.decks[id].el;
    return !!el && !el.paused && !el.ended;
  }

  async play(id: DeckId): Promise<void> {
    await this.decks[id].el?.play();
  }

  pause(id: DeckId): void {
    this.decks[id].el?.pause();
  }

  stopDeck(id: DeckId): void {
    const el = this.decks[id].el;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
  }

  seek(id: DeckId, sec: number): void {
    const el = this.decks[id].el;
    if (el && Number.isFinite(sec)) el.currentTime = Math.max(0, sec);
  }

  setDeckVolume(id: DeckId, v: number): void {
    this.decks[id].volume.gain.value = Math.min(1, Math.max(0, v));
  }

  setMasterVolume(v: number): void {
    this.master.gain.value = Math.min(1, Math.max(0, v));
  }

  /** Silencia o activa el altavoz local; no afecta a lo que sale al aire. */
  setMonitor(on: boolean): void {
    this.monitor.gain.value = on ? 1 : 0;
  }

  /** Fundido de potencia constante desde el otro deck hacia `to`, calculado sobre el reloj de audio. */
  async crossfadeTo(to: DeckId, fadeSec: number): Promise<void> {
    const from = other(to);
    // Primero se confirma que la pista entrante suena; si play() falla, la saliente no se toca.
    await this.play(to);
    const outgoing = this.decks[from].el;
    const now = this.ctx.currentTime;
    const outCurve = new Float32Array(CURVE_POINTS);
    const inCurve = new Float32Array(CURVE_POINTS);
    for (let i = 0; i < CURVE_POINTS; i++) {
      const g = equalPowerGains(i / (CURVE_POINTS - 1));
      outCurve[i] = g.out;
      inCurve[i] = g.in;
    }
    const gen = this.fadeGen.begin();
    const f = this.decks[from].fade.gain;
    const t = this.decks[to].fade.gain;
    f.cancelScheduledValues(now);
    t.cancelScheduledValues(now);
    t.setValueAtTime(0, now);
    f.setValueCurveAtTime(outCurve, now, fadeSec);
    t.setValueCurveAtTime(inCurve, now, fadeSec);
    const timer = setTimeout(() => {
      this.fadeTimers.delete(timer);
      if (!this.fadeGen.isCurrent(gen)) return; // otro fundido o un corte tomó el control de las ganancias
      // Si el deck saliente recibió otra pista mientras tanto, no se detiene la nueva.
      if (this.decks[from].el === outgoing) this.stopDeck(from);
      f.cancelScheduledValues(this.ctx.currentTime);
      f.setValueAtTime(0, this.ctx.currentTime);
      t.setValueAtTime(1, this.ctx.currentTime);
    }, fadeSec * 1000 + 100);
    this.fadeTimers.add(timer);
  }

  /** Deja `id` como único deck audible (sin fundido). */
  cut(id: DeckId): void {
    this.fadeGen.begin();
    const now = this.ctx.currentTime;
    this.decks[id].fade.gain.cancelScheduledValues(now);
    this.decks[other(id)].fade.gain.cancelScheduledValues(now);
    this.decks[id].fade.gain.setValueAtTime(1, now);
    this.decks[other(id)].fade.gain.setValueAtTime(0, now);
  }

  // ───────────── Micrófono, ducking y ecualizador ─────────────

  async listMics(): Promise<{ id: string; label: string }[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Micrófono ${i + 1}` }));
  }

  /** Pide el micrófono (sin procesado del navegador: la cadena propia se encarga) y lo conecta a la emisión. */
  async startMic(deviceId?: string): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") throw new Error("Permiso de micrófono denegado.");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new Error("No se encontró ningún micrófono.");
      throw new Error("No se pudo abrir el micrófono.");
    }
    this.attachMicStream(stream);
  }

  /** Punto de entrada común (también permite inyectar un flujo de prueba). El micrófono NO va al monitor local. */
  attachMicStream(stream: MediaStream): void {
    this.stopMic();
    const source = this.ctx.createMediaStreamSource(stream);
    const hp = this.biquad("highpass", 80, 0.7);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    const gate = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    const eq = EQ_BANDS.map((b) => this.biquad(b.type, b.frequency, b.q));
    eq.forEach((f, i) => (f.gain.value = this.pendingMicEq[EQ_BANDS[i].key]));
    const gain = this.ctx.createGain();
    gain.gain.value = this.micMuted ? 0 : this.micGain;
    const chain: AudioNode[] = [source, hp, gate, comp, ...eq, gain];
    for (let i = 0; i < chain.length - 1; i++) chain[i].connect(chain[i + 1]);
    hp.connect(analyser); // el nivel se mide antes de la puerta
    gain.connect(this.mix);
    this.mic = { stream, nodes: chain, gate, gain, eq, analyser, buf: new Float32Array(analyser.fftSize) };
    const track = stream.getAudioTracks()[0];
    if (track) {
      track.onended = () => {
        if (this.mic?.stream === stream) {
          this.stopMic();
          this.onMicLost?.();
        }
      };
    }
    this.ensureControl();
  }

  stopMic(): void {
    const m = this.mic;
    if (!m) return;
    this.mic = null;
    for (const t of m.stream.getTracks()) {
      t.onended = null;
      t.stop();
    }
    for (const n of m.nodes) n.disconnect();
    m.analyser.disconnect();
    this.micDb = -100;
    this.applyDuck(-100);
    this.idleControlLater();
  }

  get micActive(): boolean {
    return this.mic !== null;
  }

  setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    if (this.mic) this.mic.gain.gain.setTargetAtTime(muted ? 0 : this.micGain, this.ctx.currentTime, 0.01);
  }

  setMicGain(g: number): void {
    this.micGain = Math.min(2, Math.max(0, g));
    if (this.mic && !this.micMuted) this.mic.gain.gain.setTargetAtTime(this.micGain, this.ctx.currentTime, 0.01);
  }

  setMicGateThreshold(db: number): void {
    this.gateCtl = new GateController(Math.min(-20, Math.max(-90, db)));
  }

  setDuck(s: DuckSettings): void {
    this.duckCtl.setSettings(s);
  }

  setDuckForced(on: boolean): void {
    this.manualForce = on;
    this.applyForce();
  }

  /** El ducking se fuerza con el botón manual o mientras suene un cart que pide bajar la música. */
  private applyForce() {
    const cart = [...this.cartPlaying.values()].some((c) => c.duck);
    const force = this.manualForce || cart;
    this.duckCtl.setForced(force);
    if (force) this.ensureControl();
    else this.idleControlLater();
  }

  // ───────────── Carts (Cart Wall) ─────────────

  /** Descarga y decodifica el audio de un cart para poder dispararlo al instante. */
  async preloadCart(id: string, url: string): Promise<void> {
    if (this.cartBuffers.has(id)) return;
    const res = await fetch(url);
    if (!res.ok) throw new Error("No se pudo descargar el audio del cart.");
    const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.cartBuffers.set(id, buf);
  }

  hasCart(id: string): boolean {
    return this.cartBuffers.has(id);
  }

  /** Dispara un cart. Si ya suena, se reinicia (no se apilan copias). Devuelve false si aún no está precargado. */
  playCart(id: string, opts: { gainDb: number; duck: boolean }): boolean {
    const buffer = this.cartBuffers.get(id);
    if (!buffer) return false;
    this.stopCart(id);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = dbToGain(Math.min(6, Math.max(-24, opts.gainDb)));
    src.connect(gain);
    gain.connect(this.cartBus);
    const entry = { src, duck: opts.duck, endsAt: this.ctx.currentTime + buffer.duration };
    this.cartPlaying.set(id, entry);
    src.onended = () => {
      if (this.cartPlaying.get(id)?.src !== src) return; // lo reemplazó un reinicio
      this.cartPlaying.delete(id);
      gain.disconnect();
      this.applyForce();
      this.onCartEnded?.(id);
    };
    src.start();
    this.applyForce();
    return true;
  }

  stopCart(id: string): void {
    const e = this.cartPlaying.get(id);
    if (!e) return;
    this.cartPlaying.delete(id); // se quita antes para que onended del anterior no dispare el aviso de fin
    e.src.onended = null;
    try {
      e.src.stop();
    } catch {
      /* ya había terminado */
    }
    e.src.disconnect();
    this.applyForce();
    this.onCartEnded?.(id);
  }

  stopAllCarts(): void {
    for (const id of [...this.cartPlaying.keys()]) this.stopCart(id);
  }

  isCartPlaying(id: string): boolean {
    return this.cartPlaying.has(id);
  }

  /** Segundos que le quedan a un cart que suena (0 si no suena). */
  cartRemaining(id: string): number {
    const e = this.cartPlaying.get(id);
    return e ? Math.max(0, e.endsAt - this.ctx.currentTime) : 0;
  }

  setEq(target: "music" | "mic", e: EqSettings): void {
    const c = clampEq(e);
    if (target === "mic") this.pendingMicEq = c;
    const filters = target === "music" ? this.musicEq : this.mic?.eq;
    filters?.forEach((f, i) => (f.gain.value = c[EQ_BANDS[i].key]));
  }

  getMicLevelDb(): number {
    return this.micDb;
  }

  getDuckGainDb(): number {
    return this.duckDb;
  }

  private applyDuck(micDb: number) {
    const d = this.duckCtl.update({ micDb, micMuted: this.micMuted, nowMs: performance.now() });
    this.duckGain.gain.setTargetAtTime(d.targetGain, this.ctx.currentTime, Math.max(0.005, d.timeConstantSec));
    this.duckDb = gainToDb(d.targetGain);
  }

  private ensureControl() {
    if (this.controlTimer) return;
    this.controlTimer = setInterval(() => {
      let db = -100;
      if (this.mic) {
        this.mic.analyser.getFloatTimeDomainData(this.mic.buf);
        db = rmsToDb(this.mic.buf);
        const g = this.micMuted ? 0 : this.gateCtl.update(db, performance.now());
        this.mic.gate.gain.setTargetAtTime(g, this.ctx.currentTime, 0.01);
      }
      this.micDb = db;
      this.applyDuck(db);
    }, CONTROL_MS);
  }

  /** Sin micrófono y con la música ya recuperada, el bucle de control se detiene. */
  private idleControlLater() {
    const check = setInterval(() => {
      if (this.mic) {
        clearInterval(check);
        return;
      }
      if (this.duckDb === 0 && this.controlTimer) {
        clearInterval(this.controlTimer);
        this.controlTimer = null;
        clearInterval(check);
      } else if (!this.controlTimer) {
        clearInterval(check);
      }
    }, 500);
  }

  getLevels(): Levels {
    this.masterAnalyser.getFloatTimeDomainData(this.masterBuf);
    const a = this.decks.A;
    const b = this.decks.B;
    a.analyser.getFloatTimeDomainData(a.buf);
    b.analyser.getFloatTimeDomainData(b.buf);
    return {
      master: { rmsDb: rmsToDb(this.masterBuf), peakDb: peakToDb(this.masterBuf) },
      A: peakToDb(a.buf),
      B: peakToDb(b.buf),
    };
  }

  deckItem(id: DeckId): QueueItem | null {
    return this.decks[id].item;
  }

  dispose(): void {
    this.stopAllCarts();
    this.stopMic();
    if (this.controlTimer) clearInterval(this.controlTimer);
    this.controlTimer = null;
    for (const t of this.fadeTimers) clearTimeout(t);
    this.fadeTimers.clear();
    this.release(this.decks.A);
    this.release(this.decks.B);
    void this.ctx.close();
  }
}
