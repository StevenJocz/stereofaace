import { LoadGate } from "./autoplay";
import { equalPowerGains } from "./crossfade";
import { peakToDb, rmsToDb } from "./meter";
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
  private fadeTimers = new Set<ReturnType<typeof setTimeout>>();

  onDeckEnded: ((deck: DeckId) => void) | null = null;
  onDeckTime: ((deck: DeckId, current: number, duration: number) => void) | null = null;

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
    this.mix.connect(this.limiter);
    this.limiter.connect(this.master);
    this.master.connect(this.masterAnalyser);
    this.master.connect(this.dest);
    this.master.connect(this.monitor);
    this.monitor.connect(this.ctx.destination);
    this.decks = { A: this.makeDeck(), B: this.makeDeck() };
    this.decks.B.fade.gain.value = 0;
  }

  private makeDeck(): Deck {
    const volume = this.ctx.createGain();
    const fade = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    volume.connect(fade);
    fade.connect(analyser);
    analyser.connect(this.mix);
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
    const f = this.decks[from].fade.gain;
    const t = this.decks[to].fade.gain;
    f.cancelScheduledValues(now);
    t.cancelScheduledValues(now);
    t.setValueAtTime(0, now);
    f.setValueCurveAtTime(outCurve, now, fadeSec);
    t.setValueCurveAtTime(inCurve, now, fadeSec);
    const timer = setTimeout(() => {
      this.fadeTimers.delete(timer);
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
    const now = this.ctx.currentTime;
    this.decks[id].fade.gain.cancelScheduledValues(now);
    this.decks[other(id)].fade.gain.cancelScheduledValues(now);
    this.decks[id].fade.gain.setValueAtTime(1, now);
    this.decks[other(id)].fade.gain.setValueAtTime(0, now);
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
    for (const t of this.fadeTimers) clearTimeout(t);
    this.fadeTimers.clear();
    this.release(this.decks.A);
    this.release(this.decks.B);
    void this.ctx.close();
  }
}
