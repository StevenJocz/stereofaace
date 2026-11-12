#!/bin/sh
# Copia diaria de PostgreSQL (pg_dump, formato custom) con retención. Corre dentro del contenedor `backup`.
# Variables de conexión (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) las pasa docker-compose.yml.
set -eu

RETENTION="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p /backups

while true; do
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  file="/backups/stereoface-${stamp}.dump"
  if pg_dump --format=custom --file="${file}.tmp"; then
    mv "${file}.tmp" "${file}"
    echo "[backup] ok ${file} ($(du -h "${file}" | cut -f1))"
  else
    rm -f "${file}.tmp"
    echo "[backup] FALLÓ el volcado" >&2
  fi
  # Retención: borra copias más antiguas que RETENTION días
  find /backups -name 'stereoface-*.dump' -mtime +"${RETENTION}" -delete
  sleep 86400
done
