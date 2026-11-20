"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseCurrentlyPlaying, type SpotifyNow } from "@/modules/studio/spotify-now";
import { authorizeUrl, exchangeCode, fetchCurrentlyPlaying, pkceChallenge, randomToken, refreshTokens, SpotifyAuthError, type Tokens } from "./spotify-auth";

export const SPOTIFY_CALLBACK_PATH = "/api/studio/spotify/callback";
const CHANNEL = "sf-spotify-auth";
const STORE = "sf-spotify-refresh";
const POLL_MS = 5000;
const CONNECT_TIMEOUT_MS = 3 * 60_000;

export type SpotifyConn = "unconfigured" | "disconnected" | "connecting" | "connected";
export type SpotifyLink = {
  conn: SpotifyConn;
  /** Lo que suena en Spotify (solo mientras se consulta). `null` = nada reproduciéndose o aún sin dato. */
  now: SpotifyNow | null;
  error: string | null;
  connect: () => void;
  cancel: () => void;
  disconnect: () => void;
};

type Pending = { state: string; verifier: string; challenge: string };

const readStored = () => {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
};
const writeStored = (v: string | null) => {
  try {
    if (v) localStorage.setItem(STORE, v);
    else localStorage.removeItem(STORE);
  } catch {
    /* sin almacenamiento: habrá que volver a conectar la próxima vez */
  }
};

/**
 * Lee de la API de Spotify qué canción suena en la cuenta del locutor (la pestaña de Spotify que abrió) para mostrarla en el
 * estudio y ponerla como título en la emisión. El permiso es solo «ver qué está sonando». Sin `clientId` no hace nada.
 * El refresh token queda en este navegador (localStorage); el de acceso, solo en memoria.
 */
export function useSpotifyNow({ clientId, active }: { clientId: string | null; active: boolean }): SpotifyLink {
  const [conn, setConn] = useState<SpotifyConn>(clientId ? "disconnected" : "unconfigured");
  const [now, setNow] = useState<SpotifyNow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokens = useRef<Tokens | null>(null);
  const prepared = useRef<Pending | null>(null);
  const pending = useRef<Pending | null>(null);
  const timeout = useRef(0);

  const redirectUri = useCallback(() => `${window.location.origin}${SPOTIFY_CALLBACK_PATH}`, []);

  const forget = useCallback(() => {
    tokens.current = null;
    writeStored(null);
    setNow(null);
    setConn(clientId ? "disconnected" : "unconfigured");
  }, [clientId]);

  /** Token de acceso vigente; renueva con el refresh token si hace falta. */
  const access = useCallback(
    async (force = false): Promise<string> => {
      const t = tokens.current;
      if (!force && t && t.expiresAt - 30_000 > Date.now()) return t.access;
      const refresh = t?.refresh ?? readStored();
      if (!clientId || !refresh) throw new SpotifyAuthError("Conecta Spotify para ver qué suena.", true);
      const next = await refreshTokens({ clientId, refresh });
      tokens.current = next;
      if (next.refresh && next.refresh !== refresh) writeStored(next.refresh);
      return next.access;
    },
    [clientId],
  );

  // El código de autorización y el verifier se preparan antes del clic: window.open debe ocurrir dentro del gesto de la persona.
  const prepare = useCallback(async () => {
    if (!clientId) return;
    const verifier = randomToken();
    prepared.current = { state: randomToken(16), verifier, challenge: await pkceChallenge(verifier) };
  }, [clientId]);
  useEffect(() => {
    void prepare();
  }, [prepare]);

  // Al abrir el estudio: si ya se conectó antes, se reconecta sin pedir nada.
  useEffect(() => {
    if (!clientId || !readStored()) return;
    let alive = true;
    access()
      .then(() => alive && setConn("connected"))
      .catch((e: unknown) => {
        if (alive && e instanceof SpotifyAuthError && e.reauth) forget();
      });
    return () => {
      alive = false;
    };
  }, [clientId, access, forget]);

  // Resultado de la ventana de Spotify.
  useEffect(() => {
    if (!clientId || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev: MessageEvent<{ code?: string | null; state?: string | null; error?: string | null }>) => {
      const p = pending.current;
      if (!p || ev.data?.state !== p.state) return;
      pending.current = null;
      window.clearTimeout(timeout.current);
      if (!ev.data.code) {
        setError("No se concedió el permiso en Spotify.");
        setConn("disconnected");
        return;
      }
      exchangeCode({ clientId, redirectUri: redirectUri(), code: ev.data.code, verifier: p.verifier })
        .then((t) => {
          tokens.current = t;
          if (t.refresh) writeStored(t.refresh);
          setError(null);
          setConn("connected");
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "No se pudo conectar con Spotify.");
          setConn("disconnected");
        });
    };
    return () => ch.close();
  }, [clientId, redirectUri]);

  const connect = useCallback(() => {
    const p = prepared.current;
    if (!clientId || !p) return;
    prepared.current = null;
    void prepare();
    setError(null);
    const w = window.open(authorizeUrl({ clientId, redirectUri: redirectUri(), challenge: p.challenge, state: p.state }), "sf-spotify-connect", "popup,width=480,height=720");
    if (!w) {
      setError("El navegador bloqueó la ventana de Spotify. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.");
      return;
    }
    pending.current = p;
    setConn("connecting");
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => {
      if (!pending.current) return;
      pending.current = null;
      setError("Spotify no respondió a tiempo. Inténtalo de nuevo.");
      setConn("disconnected");
    }, CONNECT_TIMEOUT_MS);
  }, [clientId, prepare, redirectUri]);

  const cancel = useCallback(() => {
    pending.current = null;
    window.clearTimeout(timeout.current);
    setConn("disconnected");
  }, []);

  const disconnect = useCallback(() => {
    setError(null);
    forget();
  }, [forget]);

  // Consulta periódica mientras está conectado y hace falta (panel abierto o audio al aire). No depende de que la pestaña esté visible:
  // el locutor suele estar en la pestaña de Spotify y el estudio sigue sonando (los navegadores no frenan una pestaña con audio).
  useEffect(() => {
    if (conn !== "connected" || !active) return;
    let alive = true;
    let timer = 0;
    const tick = async () => {
      let wait = POLL_MS;
      try {
        let r = await fetchCurrentlyPlaying(await access());
        if (r.kind === "unauthorized") r = await fetchCurrentlyPlaying(await access(true));
        if (!alive) return;
        if (r.kind === "ok") {
          setNow(parseCurrentlyPlaying(r.body));
          setError(null);
        } else if (r.kind === "nothing") {
          setNow(null);
          setError(null);
        } else if (r.kind === "limited") {
          wait = r.retryMs;
        } else if (r.kind === "unauthorized") {
          setError("Spotify pide volver a conectar la cuenta.");
          forget();
          return;
        } else {
          setError(
            r.status === 403
              ? "Spotify no deja usar esta cuenta con la aplicación. Si la aplicación está en modo desarrollo, agrega el correo de la cuenta en el panel de Spotify for Developers."
              : `Spotify respondió con un error (${r.status}).`,
          );
        }
      } catch (e) {
        if (!alive) return;
        if (e instanceof SpotifyAuthError && e.reauth) {
          setError(e.message);
          forget();
          return;
        }
        setError("No se pudo consultar a Spotify. Se reintenta solo.");
      }
      if (alive) timer = window.setTimeout(() => void tick(), wait);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [conn, active, access, forget]);

  return { conn, now: active && conn === "connected" ? now : null, error, connect, cancel, disconnect };
}
