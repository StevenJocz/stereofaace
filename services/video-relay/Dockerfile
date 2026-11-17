# Relay de video: MediaMTX (RTSP interno) → FFmpeg → RTMP de YouTube. Servicio privado: no publica puertos.
FROM node:24-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY ffmpeg.ts relay.ts server.ts ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "server.ts"]
