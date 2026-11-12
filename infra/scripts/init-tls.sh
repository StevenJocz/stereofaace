#!/usr/bin/env bash
# Primer certificado Let's Encrypt con Nginx en marcha (método del certificado temporal).
# Requisitos: DNS A/AAAA de $DOMAIN apuntando a este servidor, puertos 80 y 443 abiertos, y .env completo
# (DOMAIN y LETSENCRYPT_EMAIL). Para probar sin gastar el límite de Let's Encrypt: STAGING=1 ./infra/scripts/init-tls.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

set -a
# shellcheck disable=SC1091
source .env
set +a
: "${DOMAIN:?Falta DOMAIN en .env}"
: "${LETSENCRYPT_EMAIL:?Falta LETSENCRYPT_EMAIL en .env}"

CONF=./infra/certbot/conf
WWW=./infra/certbot/www
mkdir -p "$CONF/live/$DOMAIN" "$WWW"

# 1) Certificado autofirmado de 1 día: Nginx necesita ALGUNO para arrancar el bloque 443
if [ ! -e "$CONF/live/$DOMAIN/fullchain.pem" ]; then
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$CONF/live/$DOMAIN/privkey.pem" -out "$CONF/live/$DOMAIN/fullchain.pem" \
    -subj "/CN=localhost" >/dev/null 2>&1
fi

# 2) Arranca la pila (db, migraciones, web) y Nginx con el temporal
docker compose up -d db migrate web nginx

# 3) Quita el temporal y pide el real por webroot (Nginx sirve /.well-known/acme-challenge)
rm -rf "$CONF/live/$DOMAIN" "$CONF/archive/$DOMAIN" "$CONF/renewal/$DOMAIN.conf"
STAGING_FLAG=""
[ "${STAGING:-0}" = "1" ] && STAGING_FLAG="--staging"
docker compose run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive $STAGING_FLAG

# 4) Recarga Nginx con el certificado real
docker compose exec nginx nginx -s reload
echo "✔ Certificado instalado para $DOMAIN"
echo "  Renovación (programar en cron, p. ej. diaria a las 03:30):"
echo "    cd $(pwd) && docker compose run --rm --entrypoint certbot certbot renew --quiet && docker compose exec nginx nginx -s reload"
