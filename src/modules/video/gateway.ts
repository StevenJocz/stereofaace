import { DomainError } from "@/lib/errors";

/** Servicio de relay (FFmpeg) dentro de la red privada de Compose. Habla solo con el servidor, con un token compartido. */
export class RelayClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}`, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new DomainError("relay_unavailable", "El servicio de video no responde. Avisa a quien administra el servidor.");
    }
    if (!res.ok) throw new DomainError("relay_unavailable", `El servicio de video respondió con el error ${res.status}.`);
    return (await res.json()) as T;
  }

  /** `ingestUrl` lleva la clave de YouTube: solo viaja servidor → relay, nunca al navegador ni a un registro. */
  async start(ingestUrl: string): Promise<void> {
    await this.call("POST", "/start", { ingestUrl });
  }
  async stop(): Promise<void> {
    await this.call("POST", "/stop", {});
  }
  async status(): Promise<{ running: boolean; error?: string }> {
    return this.call("GET", "/status");
  }
}

/** Entrega la oferta WebRTC del navegador a MediaMTX (WHIP) y devuelve solo la respuesta SDP. */
export async function forwardWhip(whipBase: string, offerSdp: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(`${whipBase}/cabina/whip`, {
      method: "POST",
      headers: { "content-type": "application/sdp" },
      body: offerSdp,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DomainError("relay_unavailable", "El servicio de video no responde. Avisa a quien administra el servidor.");
  }
  if (res.status === 409 || res.status === 400 || res.status === 404) {
    // 4xx: otra señal ya publica en la cabina, o la oferta no es válida.
    throw new DomainError("whip_rejected", "La cabina ya está recibiendo otra señal o la conexión no fue válida. Finaliza e inténtalo de nuevo.");
  }
  if (!res.ok) throw new DomainError("relay_unavailable", `El servicio de video respondió con el error ${res.status}.`);
  const answer = await res.text();
  if (!answer.startsWith("v=0")) throw new DomainError("whip_rejected", "El servicio de video devolvió una respuesta no válida.");
  return answer;
}

/** La oferta del navegador: solo video, tamaño razonable. Rechaza cualquier pista de audio. */
export function validateOffer(sdp: unknown): string {
  if (typeof sdp !== "string" || sdp.length < 20 || sdp.length > 30_000 || !sdp.startsWith("v=0")) throw new DomainError("video_offer", "La oferta de conexión no es válida.");
  if (!/^m=video /m.test(sdp)) throw new DomainError("video_offer", "La conexión no incluye video.");
  if (/^m=audio /m.test(sdp)) throw new DomainError("video_offer", "La cámara en cabina solo envía video: el audio es siempre el de la radio.");
  return sdp;
}
