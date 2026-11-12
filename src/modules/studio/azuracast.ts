import { DomainError } from "@/lib/errors";

export type AzFile = { id: string; path: string; title: string; artist: string; durationSec: number | null };
export type AzFolder = { path: string; name: string };
export type AzPlaylist = { id: number; name: string; trackCount: number };
export type AzuraConfig = { baseUrl: string; stationId: string; apiKey: string };

type RawMedia = {
  id?: number;
  path?: string;
  title?: string;
  artist?: string;
  length?: number;
  playlists?: { id: number }[];
};
type RawListItem = { path?: string; path_short?: string; text?: string; type?: string; media?: RawMedia | null };
type RawPlaylist = { id: number; name: string; num_songs?: number };

const baseName = (p: string) => p.split("/").pop() ?? p;

function toFile(m: RawMedia): AzFile {
  const path = m.path ?? "";
  return {
    id: String(m.id ?? ""),
    path,
    title: m.title?.trim() || baseName(path).replace(/\.[^.]+$/, ""),
    artist: m.artist?.trim() ?? "",
    durationSec: typeof m.length === "number" && m.length > 0 ? m.length : null,
  };
}

/** Cliente mínimo de la API REST de AzuraCast (solo lectura de biblioteca y audio). */
export class AzuraClient {
  constructor(
    private readonly cfg: AzuraConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string): string {
    return `${this.cfg.baseUrl.replace(/\/+$/, "")}/api/station/${this.cfg.stationId}${path}`;
  }

  private async request(path: string, extra: Record<string, string> = {}, passthrough: number[] = [], init: { method?: string; body?: string } = {}): Promise<Response> {
    // redirect: "error" — la clave nunca debe viajar a otro host si AzuraCast redirige.
    const res = await this.fetchImpl(this.url(path), { ...init, headers: { "X-API-Key": this.cfg.apiKey, ...extra }, redirect: "error" });
    if (res.status === 401 || res.status === 403) {
      throw new DomainError("azuracast_auth", "Clave API no válida o sin permisos en AzuraCast.");
    }
    if (!res.ok && res.status !== 206 && !passthrough.includes(res.status)) {
      throw new DomainError("azuracast_error", `AzuraCast respondió con el error ${res.status}.`);
    }
    return res;
  }

  private async json<T>(path: string): Promise<T> {
    return (await (await this.request(path)).json()) as T;
  }

  async listFolders(parent: string): Promise<{ folders: AzFolder[]; files: AzFile[] }> {
    const items = await this.json<RawListItem[]>(`/files/list?currentDirectory=${encodeURIComponent(parent)}`);
    return this.splitList(items);
  }

  async searchFiles(q: string): Promise<AzFile[]> {
    const items = await this.json<RawListItem[]>(
      `/files/list?currentDirectory=&searchPhrase=${encodeURIComponent(q)}`,
    );
    return this.splitList(items).files;
  }

  private splitList(items: RawListItem[]): { folders: AzFolder[]; files: AzFile[] } {
    const folders: AzFolder[] = [];
    const files: AzFile[] = [];
    for (const it of items) {
      if (it.type === "directory" && it.path) {
        folders.push({ path: it.path, name: it.text || it.path_short || baseName(it.path) });
      } else if (it.type === "media" && it.media?.id != null) {
        files.push(toFile(it.media));
      }
    }
    return { folders, files };
  }

  async listPlaylists(): Promise<AzPlaylist[]> {
    const rows = await this.json<RawPlaylist[]>("/playlists");
    return rows.map((p) => ({ id: p.id, name: p.name, trackCount: p.num_songs ?? 0 }));
  }

  /** Ids de todas las pistas de la biblioteca (para comprobar que una lista guardada sigue siendo válida). */
  async allFileIds(): Promise<Set<string>> {
    const all = await this.json<RawMedia[]>("/files");
    return new Set(all.map((m) => String(m.id ?? "")));
  }

  async playlistFiles(id: number): Promise<AzFile[]> {
    const all = await this.json<RawMedia[]>("/files");
    return all.filter((m) => m.playlists?.some((p) => p.id === id)).map(toFile);
  }

  /** Salta la pista en curso del AutoDJ (para que un cambio de listas se oiga sin esperar). */
  async skipCurrent(): Promise<void> {
    await this.request("/backend/skip", {}, [], { method: "POST" });
  }

  /** Listas de reproducción tal como las entrega AzuraCast (incluye el origen y la dirección remota). */
  async listPlaylistsRaw(): Promise<{ id: number; name: string; source?: string; type?: string; remote_url?: string | null; is_enabled?: boolean }[]> {
    return this.json("/playlists");
  }

  async createPlaylist(body: Record<string, unknown>): Promise<void> {
    await this.request("/playlists", { "Content-Type": "application/json" }, [], { method: "POST", body: JSON.stringify(body) });
  }

  async updatePlaylist(id: number, body: Record<string, unknown>): Promise<void> {
    await this.request(`/playlist/${Math.trunc(id)}`, { "Content-Type": "application/json" }, [], { method: "PUT", body: JSON.stringify(body) });
  }

  /** Últimas reproducciones de la estación (respuesta cruda; requiere clave con permiso de lectura de la estación). */
  async history(limit: number): Promise<unknown> {
    return this.json<unknown>(`/history?per_page=${Math.min(Math.max(Math.trunc(limit) || 10, 1), 50)}`);
  }

  /** Carátula de una pista (AzuraCast devuelve una imagen genérica si no tiene). */
  async art(id: string): Promise<Response> {
    if (!/^\d+$/.test(id)) throw new DomainError("azuracast_bad_id", "Identificador de pista no válido.");
    return this.request(`/art/${id}`);
  }

  /** Audio de una pista, tal como lo entrega AzuraCast (respeta `Range`). */
  async fileStream(id: string, range: string | null): Promise<Response> {
    if (!/^\d+$/.test(id)) throw new DomainError("azuracast_bad_id", "Identificador de pista no válido.");
    return this.request(`/file/${id}/play`, range ? { Range: range } : {}, [416]); // 416: Range fuera de límites, se devuelve tal cual
  }
}
