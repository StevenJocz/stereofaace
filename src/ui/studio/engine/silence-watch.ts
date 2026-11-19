/**
 * Detecta cuándo un audio externo (p. ej. un video compartido) terminó: tras haber sonado, queda en silencio un rato seguido.
 * `push` recibe el nivel (dB) cada tanto y devuelve `true` una sola vez cuando se cumple.
 */
export class SilenceWatch {
  private heard = false;
  private quietSince: number | null = null;
  constructor(
    private readonly thresholdDb = -50,
    private readonly quietMs = 6000,
  ) {}

  push(db: number, nowMs: number): boolean {
    if (db > this.thresholdDb) {
      this.heard = true;
      this.quietSince = null;
      return false;
    }
    if (!this.heard) return false; // todavía no sonó: no es un final
    this.quietSince ??= nowMs;
    if (nowMs - this.quietSince > this.quietMs) {
      this.heard = false;
      this.quietSince = null;
      return true;
    }
    return false;
  }
}
