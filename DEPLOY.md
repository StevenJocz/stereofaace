# StereoFace — Guía de despliegue (para un agente que ejecuta el despliegue)

Este documento está escrito para que otra IA (o una persona) despliegue StereoFace en un servidor propio **sin necesidad de conocer el proyecto**. Léelo entero antes de ejecutar nada. Los pasos están en orden; cada uno dice cómo comprobar que salió bien.

> **Estado honesto.** Todo lo de producción (`Dockerfile`, `docker-compose.yml`, Nginx, TLS, copias de seguridad) está **escrito pero nunca se ejecutó**: la máquina de desarrollo no tenía Docker. Lo que sí se verificó está en la sección 2. Si algún paso falla, **no improvises cambios de seguridad**: diagnostica, corrige el archivo de infraestructura concreto y anota el cambio (sección 13).

---

## 1. Qué es y cómo queda desplegado

StereoFace es una revista digital (Next.js 16, App Router) con panel de administración, CMS con editor, radio y PostgreSQL. Las imágenes editoriales propias se guardan en el volumen persistente `stereoface_media`.

```
Internet ──443/80──► nginx ──► web (Next.js, puerto interno 3000) ──► db (PostgreSQL 17)
                       ▲                                                    ▲
                    certbot (solo para emitir/renovar)        backup (pg_dump diario → ./backups)
                                       migrate (tarea única: migraciones + datos base + primer admin)
```

| Servicio | Imagen | Puertos publicados | Función |
|---|---|---|---|
| `db` | postgres:17-alpine | **ninguno** | Base de datos. Volumen `pgdata`. |
| `migrate` | stereoface-web:latest (se construye aquí) | ninguno | Tarea de una sola ejecución: aplica migraciones, carga datos base, crea el primer superadministrador. |
| `web` | stereoface-web:latest | **ninguno** (solo `expose 3000`) | La aplicación. Healthcheck en `/api/health`; monta `stereoface_media` en `/data/media`. |
| `nginx` | nginx:1.27-alpine | 80 y 443 | Proxy inverso, TLS, cabeceras, límites de tasa. |
| `certbot` | certbot/certbot | ninguno | Perfil `tls`: solo se invoca a mano o por cron. |
| `backup` | postgres:17-alpine | ninguno | Copia diaria `pg_dump -Fc` en `./backups` con retención. |

Requisitos del servidor: Linux (Ubuntu 22.04/24.04 recomendado), **2 vCPU y 2–4 GB de RAM**, ≥ 20 GB de disco, Docker Engine + plugin Compose v2 (`docker compose version`), `git` (o `rsync`), `openssl`, `curl`.

No hay Redis, worker ni MinIO: el código aún no los usa. Las imágenes editoriales no requieren MinIO: se almacenan localmente en el volumen de Docker. **No los añadas.**

---

## 2. Qué está verificado y qué no

**Verificado en la máquina de desarrollo (Windows, Node 24):**
- `npm run build` genera `output: "standalone"`; se ejecutó `node server.js` con ese resultado, conectado por el controlador `pg` real a un PostgreSQL emulado (PGlite con socket).
- `/api/health`, `/robots.txt`, `/sitemap.xml`, `/rss.xml`, `/api/radio/stations`, `/noticias`, `/admin/login` respondieron 200 con cabeceras de seguridad.
- `node dist/migrate.mjs` (script empaquetado que usa el contenedor `migrate`): idempotente (se ejecutó varias veces), crea el superadministrador una sola vez, crea usuarios adicionales con `ADD_USER_*`, rechaza roles inválidos y falla claro sin `DATABASE_URL`.
- 101 pruebas de Vitest, `tsc`, `eslint` y `next build` en verde.
- `docker-compose.yml` parsea como YAML válido y todos los `depends_on` resuelven; `bash -n` pasa en los scripts; el lockfile contiene los binarios nativos para Linux musl (Next/SWC, lightningcss, Tailwind oxide, sharp, esbuild).

**NO verificado (tú eres el primero en ejecutarlo):**
- `docker compose build` / el `Dockerfile`.
- `docker compose up` completo y el healthcheck de `web`.
- `nginx -t` y la plantilla de Nginx.
- Emisión de certificados con `infra/scripts/init-tls.sh` y su renovación.
- `backup.sh` y la restauración.
- **Inicio de sesión y Server Actions con la build standalone detrás de Nginx** (se probó el login en `next dev`, no en producción). Es la prueba funcional más importante tras el despliegue (sección 8).

---

## 3. Lo que debe proporcionar el humano (pídelo antes de empezar)

No inventes ni adivines estos datos. Si falta alguno, **detente y pregunta**.

1. **Dominio** (p. ej. `stereoface.com`) con el DNS **ya apuntando** al servidor: registro `A` (y `AAAA` si hay IPv6) del dominio exacto. Let's Encrypt fallará si no resuelve. Comprueba: `dig +short DOMINIO` devuelve la IP del servidor.
2. **Acceso SSH** al servidor (usuario con `sudo`) y cómo llevar el código allí (repositorio git remoto, o `rsync`/`scp`). **El proyecto no está en un repositorio git todavía**: si no hay remoto, copia la carpeta excluyendo `node_modules`, `.next`, `.data`, `dist`, `.env*` y `backups`.
3. **Correo para Let's Encrypt** (`LETSENCRYPT_EMAIL`).
4. **Correo y contraseña del primer superadministrador.** Contraseña de **mínimo 12 caracteres**. Si el humano no la da, genera una con `openssl rand -base64 18`, entrégasela por un canal seguro una sola vez y **no la dejes en logs ni en el historial** (sección 12).
5. Confirmación de que el servidor permite abrir 80 y 443 hacia Internet.

---

## 4. Variables de entorno

Se definen en un archivo `.env` junto a `docker-compose.yml` (plantilla: `.env.production.example`). **Permisos `600`, nunca en git.**

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DOMAIN` | sí | Dominio **sin** protocolo. Nginx y certificados. |
| `NEXT_PUBLIC_SITE_URL` | sí | URL pública completa, `https://`, **sin barra final** (p. ej. `https://stereoface.com`). **Se incrusta al compilar** (canónicas, sitemap, RSS, Open Graph). Si cambia el dominio hay que **reconstruir la imagen** (`docker compose build`). |
| `LETSENCRYPT_EMAIL` | sí | Avisos de caducidad de certificados. |
| `POSTGRES_DB`, `POSTGRES_USER` | no | Por defecto `stereoface`. |
| `POSTGRES_PASSWORD` | sí | **Solo hexadecimal** (va dentro de una URL): `openssl rand -hex 24`. |
| `DB_POOL_MAX` | no | Conexiones del pool de `web` (10 por defecto). |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | solo 1.ª vez | `migrate` crea el superadministrador **solo si no existe ninguno**. Después **borra `ADMIN_PASSWORD`** del `.env`. |
| `ADD_USER_EMAIL`, `ADD_USER_PASSWORD`, `ADD_USER_NAME`, `ADD_USER_ROLE` | opcional | Crea un usuario extra (`superadmin`/`admin`/`editor`/`redactor`/`colaborador`) si el correo no existe. No hay pantalla de usuarios aún. Borra `ADD_USER_PASSWORD` después. |
| `RADIO_EMBED_HOSTS` | no | Hosts extra permitidos para reproductores oficiales incrustados (separados por comas). **Vacío por defecto: déjalo vacío.** |
| `BACKUP_RETENTION_DAYS` | no | Días de retención de copias (14 por defecto). |
| `MEDIA_ROOT` | no | Directorio interno de imágenes; en Compose debe seguir siendo `/data/media`. |

**Nunca definas** `ALLOW_PGLITE` ni `ALLOW_DEMO_SEED` en producción. Sin `DATABASE_URL` la aplicación **se niega a arrancar** en producción (es intencional: PGlite es solo de desarrollo y de un único proceso).

---

## 5. Procedimiento de despliegue (en este orden)

Todos los comandos se ejecutan **en el servidor**, en la carpeta del proyecto.

### Paso 1 — Preparar el servidor
```bash
# Firewall: solo SSH, HTTP y HTTPS. Nunca abras 5432 ni 3000.
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw enable
docker --version && docker compose version     # ambos deben responder
```
Si Docker no está instalado, instálalo desde la documentación oficial de Docker para la distribución (no con scripts de terceros).

### Paso 2 — Código y `.env`
```bash
git clone <URL_DEL_REPO> stereoface && cd stereoface    # o copia la carpeta con rsync
cp .env.production.example .env && chmod 600 .env
# Edita .env: DOMAIN, NEXT_PUBLIC_SITE_URL, LETSENCRYPT_EMAIL, ADMIN_EMAIL, ADMIN_PASSWORD
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
```
Comprueba que `DOMAIN`, `NEXT_PUBLIC_SITE_URL` y `LETSENCRYPT_EMAIL` ya **no** contienen `example`, y que `ADMIN_PASSWORD` tiene ≥ 12 caracteres.

### Paso 3 — Validar la configuración (sin arrancar nada)
```bash
docker compose config > /dev/null && echo "compose OK"
```
Debe imprimir `compose OK`. Si falla con «define POSTGRES_PASSWORD / NEXT_PUBLIC_SITE_URL / DOMAIN», falta esa variable en `.env`.

### Paso 4 — Construir la imagen
```bash
docker compose build
```
Tarda varios minutos. Construye una sola imagen (`stereoface-web:latest`) que usan `migrate` y `web`. **No necesita base de datos.** Errores típicos: sin memoria (usa swap de 2 GB en un VPS de 2 GB), sin espacio en disco.

### Paso 5 — Certificado TLS y arranque
```bash
# Primero con el entorno de pruebas de Let's Encrypt (no gasta límite de emisiones):
STAGING=1 ./infra/scripts/init-tls.sh
# Si terminó con «✔ Certificado instalado», repite con el real:
./infra/scripts/init-tls.sh
```
Qué hace el script: crea un certificado autofirmado de 1 día para que Nginx pueda arrancar → `docker compose up -d db migrate web nginx` (esto ejecuta migraciones y crea el administrador) → borra el temporal → pide el certificado real por *webroot* → recarga Nginx.

**No ejecutes `docker compose up -d` a secas antes de este paso**: Nginx no arrancará sin certificado.

Si el certificado de *staging* se emitió, el navegador lo marcará como no fiable; es normal. Al repetir sin `STAGING=1` se reemplaza por el real.

### Paso 6 — Cerrar el arranque inicial
1. Comprueba que `migrate` terminó bien: `docker compose logs migrate` debe contener `✓ migraciones aplicadas`, `✓ datos base cargados` y `✓ superadministrador creado`.
2. Entra una vez en `https://DOMINIO/admin/login` (sección 8) para confirmar el login.
3. **Borra `ADMIN_PASSWORD` (y `ADD_USER_PASSWORD`) del `.env`** y sanea el historial de la shell si la escribiste en línea.
4. Programa la renovación del certificado y la copia externa (sección 9 y 10).

---

## 6. Qué esperar en un sitio recién desplegado

- La portada muestra **«Próximamente — Estamos preparando la primera edición de StereoFace»** en producción: **no hay contenido demo** (el seed demo está bloqueado en producción). Es correcto.
- Los bloques de hero/destacados de la portada (`home_blocks`) **no tienen pantalla de administración todavía**; el contenido sale de los artículos publicados en «Lo más reciente».
- Para ver contenido: entrar al panel → Artículos → crear y **publicar** uno.
- Radio: existe una emisora **The Lot Radio, desactivada**, sin URL y con autorización «pendiente». **Debe seguir así.** No hay emisoras activas; la barra de radio queda sin fuente hasta que el humano registre una emisora autorizada.
- El formulario de newsletter guarda correos como «pendiente»; **no envía correo** (sin proveedor).

---

## 7. Comprobaciones de humo (con resultado esperado)

Sustituye `DOMINIO`. Ejecuta todas tras el paso 5.

```bash
curl -sI https://DOMINIO/            | head -1     # HTTP/2 200
curl -sI http://DOMINIO/             | head -3     # 301 → https://DOMINIO/
curl -s  https://DOMINIO/robots.txt                # Disallow: /admin y /api/ ; línea Sitemap con https://DOMINIO
curl -s  https://DOMINIO/sitemap.xml | head -5     # XML con <urlset>
curl -s  https://DOMINIO/rss.xml     | head -5     # <rss version="2.0">
curl -sI https://DOMINIO/noticias    | head -1     # HTTP/2 200
curl -sI https://DOMINIO/admin/login | head -1     # HTTP/2 200
curl -sI https://DOMINIO/api/health  | head -1     # HTTP/2 404  (es a propósito: solo interno)
curl -sI https://DOMINIO/            | grep -iE 'strict-transport|x-content-type|x-frame|referrer-policy|permissions-policy'
```
- Las URLs de `sitemap.xml`, `robots.txt` y `rss.xml` deben usar `https://DOMINIO` (si salen con otro dominio, `NEXT_PUBLIC_SITE_URL` estaba mal al compilar: corrige y `docker compose build && docker compose up -d web`).
- Salud interna: `docker compose ps` debe mostrar `web` como `healthy`, y
  `docker compose exec web node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"` → `{"status":"ok","db":"ok"}`.
- Imágenes: sube una imagen desde **Admin → Artículos**, guarda el artículo y abre su URL `/media/<UUID>`. Debe responder `200`, `Content-Type: image/*`; después de `docker compose up -d --force-recreate web` la misma URL debe seguir respondiendo. **Nunca ejecutes `docker compose down -v`**: también borra `stereoface_media`.
- Configuración de Nginx: `docker compose exec nginx nginx -t` → `syntax is ok` y `test is successful`.
- Certificado: `echo | openssl s_client -connect DOMINIO:443 -servername DOMINIO 2>/dev/null | openssl x509 -noout -issuer -dates` (emisor Let's Encrypt).
- Contenedores sin reinicios continuos: `docker compose ps` (columna STATUS) y `docker compose logs --tail=50 web nginx`.

---

## 8. Prueba funcional de inicio de sesión (la más importante, aún no verificada)

La cookie de sesión es `Secure`: **solo funciona por HTTPS**. Por eso esta prueba exige que el TLS esté activo.

1. Abre `https://DOMINIO/admin/login`, entra con `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Debe llevar a `/admin`.
2. Entra en `/admin/articulos`, crea un borrador con un título, escribe texto en el editor, espera el autoguardado («Guardado») y recarga: el texto debe seguir.
3. Publícalo y abre `https://DOMINIO/noticias`: debe aparecer, y también en `https://DOMINIO/sitemap.xml` y `https://DOMINIO/rss.xml`.
4. Sin sesión, `https://DOMINIO/admin` debe redirigir al login.

Si el login **falla con un error de Server Action / «Invalid Server Actions request» / origen no coincide**: Next compara `Origin` con `Host`/`X-Forwarded-Host`. `infra/nginx/proxy_params.inc` ya envía `Host` y `X-Forwarded-Host`; verifica que el bloque `location` use `include /etc/nginx/conf.d/proxy_params.inc;` y que `DOMAIN` coincida con el dominio con el que se navega (¿acceso por `www.`? el certificado y `server_name` cubren solo `DOMAIN`). Si hace falta, añadir el dominio en `experimental.serverActions.allowedOrigins` de `next.config.ts` y reconstruir.

Si el login falla en silencio (vuelve al formulario): comprueba que se accede por **HTTPS** y no por la IP.

Borra después el artículo de prueba si el humano no quiere conservarlo.

---

## 9. Certificados: renovación

Los certificados duran 90 días. Programa (cron de root o del usuario que ejecuta Docker), a diario:

```cron
30 3 * * * cd /RUTA/stereoface && docker compose run --rm --entrypoint certbot certbot renew --quiet && docker compose exec -T nginx nginx -s reload
```
Comprueba una vez en seco: `docker compose run --rm --entrypoint certbot certbot renew --dry-run`.

---

## 10. Copias de seguridad y restauración

El contenedor `backup` hace `pg_dump --format=custom` cada 24 h en `./backups/stereoface-AAAAMMDDTHHMMSSZ.dump` y borra las de más de `BACKUP_RETENTION_DAYS` días. Comprueba la primera: `ls -lh backups/` y `docker compose logs backup` (`[backup] ok ...`).

**Una copia que solo existe en el mismo servidor no es una copia.** Configura (o pide al humano que elija) un destino externo: `rsync`/`rclone` diario de `./backups` a otro equipo o almacenamiento de objetos.

**Restaurar** (destruye los datos actuales de la base; confirma con el humano antes):
```bash
docker compose stop web
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < backups/stereoface-XXXX.dump
docker compose up -d web
```
Prueba la restauración **al menos una vez** en un entorno de ensayo: aún no se ha ejecutado.

---

## 11. Actualizar y volver atrás

Actualizar a una nueva versión del código:
```bash
git pull                                  # o copiar los archivos nuevos
docker compose build                      # reconstruye stereoface-web:latest
docker compose run --rm migrate           # aplica migraciones nuevas (idempotente)
docker compose up -d web                  # reinicia solo la aplicación
```
Antes de actualizar, fuerza una copia: `docker compose exec backup sh -c 'pg_dump --format=custom --file=/backups/pre-update.dump'` (o `docker compose exec -T db pg_dump -U stereoface -Fc stereoface > backups/pre-update.dump`).

**Volver atrás:** las migraciones solo avanzan, no hay «down». Para revertir cambios de esquema, restaura el `pg_dump` previo (sección 10) y vuelve al commit anterior (`git checkout <commit> && docker compose build && docker compose up -d web`).

Si cambia `NEXT_PUBLIC_SITE_URL` (nuevo dominio): actualiza `DOMAIN` y la URL en `.env`, emite certificado nuevo para el dominio y reconstruye (`docker compose build`).

---

## 12. Reglas de seguridad para quien despliega

**HAZ:**
- Mantén Postgres **sin puertos publicados** y `web` solo con `expose`. Solo Nginx escucha en 80/443.
- Deja que Nginx **sobrescriba** `X-Forwarded-For` (`proxy_params.inc`): los límites de tasa de la aplicación confían en él. No lo cambies a `$proxy_add_x_forwarded_for`.
- Mantén **una sola instancia de `web`** (los límites de tasa son en memoria). No escales a réplicas sin antes mover esos límites a Redis.
- Mantén HSTS activado solo cuando el HTTPS esté confirmado (ya lo está tras el paso 5).
- Trata `.env` como secreto: `chmod 600`, fuera de git, no pegarlo en chats, tickets ni logs.

**NO HAGAS:**
- **No actives The Lot Radio** ni ninguna emisora de terceros, ni rellenes su URL, ni cambies registros de autorización/permiso en la base. La activación exige autorización escrita del titular y una URL oficial; la decide el humano en `/admin/radio`. (La base lo impide con restricciones `CHECK`.)
- **No ejecutes el seed demo** (`npm run db:seed`) ni definas `ALLOW_DEMO_SEED`: crearía contenido ficticio en un sitio real.
- No definas `ALLOW_PGLITE`, no uses PGlite en producción.
- No publiques el puerto 5432 ni 3000, ni quites el `return 404` de `/api/health`.
- No subas `.env`, `infra/certbot/` ni `backups/` a git (ya están en `.gitignore`).
- No bajes la plantilla de Nginx a HTTP «para probar»: la cookie de sesión es `Secure`.
- No hagas `docker compose down -v`: borra el volumen `pgdata` (toda la base). Usa `docker compose down` (sin `-v`).

---

## 13. Problemas conocidos y trampas

- **Cache Components (Next 16):** todo dato dinámico debe ir bajo `<Suspense>` o `await connection()`; si modificas páginas y el build falla con errores de «uncached data / Date / random during prerender», esa es la causa.
- **Primer arranque lento de `web`:** el healthcheck tiene `start-period` de 40 s; `nginx` espera a que `web` esté `healthy`.
- **`migrate` falla con «No se pudo conectar a PostgreSQL»:** espera/reintenta 60 s; si persiste, revisa `docker compose logs db` y que `POSTGRES_PASSWORD` no haya cambiado tras crear el volumen (el volumen conserva la contraseña original; para cambiarla hay que usar `ALTER USER` o recrear el volumen, perdiendo datos).
- **`NEXT_PUBLIC_SITE_URL` es de compilación:** cambiarlo en `.env` sin reconstruir no tiene efecto.
- **Imágenes:** el CMS admite JPEG, PNG, WebP y AVIF de hasta 10 MiB. Exige texto alternativo, crédito y licencia; se sirven desde `/media/<UUID>` y viven en el volumen `stereoface_media`. Si una imagen devuelve 404, revisa primero `docker compose exec web ls -la /data/media` y que el volumen siga montado.
- **CSP parcial:** las cabeceras incluyen `frame-ancestors 'none'`, `base-uri`, `object-src`, `form-action`, pero no una política `script-src` estricta (la página usa un script de arranque en línea y JSON-LD). Mejora pendiente con nonces.
- **Rendimiento móvil (Lighthouse simulado):** 83–84; accesibilidad, buenas prácticas y SEO 100. Es una limitación documentada, no un fallo del despliegue.
- **Correo:** no se envía ninguno (newsletter solo almacena).
- **Windows de desarrollo:** el problema de ruta larga (MAX_PATH) con esbuild solo afecta al desarrollo en esa máquina, no al servidor Linux.

---

## 14. Si algo sale mal: diagnóstico rápido

| Síntoma | Qué mirar |
|---|---|
| `nginx` en bucle de reinicio | `docker compose logs nginx`: suele ser certificado ausente (ejecuta/repite `init-tls.sh`) o `nginx -t` con error de plantilla. |
| 502 Bad Gateway | `docker compose ps`: ¿`web` está `healthy`? `docker compose logs web`. |
| Certbot: «Timeout during connect» / «unauthorized» | DNS no apunta al servidor, puerto 80 cerrado en firewall/proveedor, o Nginx caído. |
| Certbot: límite de emisión | Usar `STAGING=1` para pruebas; esperar al reinicio del límite. |
| `web` no arranca y dice que falta `DATABASE_URL` | Variable no llega al contenedor: revisar `environment` de `web` en `docker-compose.yml`. Es la guarda de producción funcionando. |
| Login no entra | Sección 8 (HTTPS, dominio, Server Actions). |
| Sitemap/RSS con dominio equivocado | `NEXT_PUBLIC_SITE_URL` mal al compilar → corregir y reconstruir. |
| Disco lleno | `docker system df`, `du -sh backups`, rotación de logs ya configurada (10 MB × 5 por servicio). |

---

## 15. Registro de lo que hagas

Al terminar, deja por escrito (en el informe al humano y, si procede, en `PROGRESS.md`): fecha, versión/commit desplegado, resultado de cada comprobación de la sección 7 y 8, qué cosas **no pudiste verificar**, y cualquier cambio que hayas hecho a los archivos de infraestructura (con el motivo). Si algo del apartado «No verificado» (sección 2) falló o requirió correcciones, descríbelo: es información valiosa para el siguiente despliegue.

## 16. Preguntas que debes hacer al humano si no tienes la respuesta

1. ¿Cuál es el dominio y su DNS ya apunta al servidor?
2. ¿Cómo llevo el código al servidor (URL del repositorio o acceso para copiarlo)?
3. ¿Qué correo y contraseña uso para el primer administrador y qué correo para Let's Encrypt?
4. ¿Dónde guardo las copias de seguridad fuera del servidor?
5. ¿Debe el sitio responder también en `www.DOMINIO`? (Hoy solo cubre el dominio exacto; añadirlo exige ampliar `server_name` y el certificado.)
