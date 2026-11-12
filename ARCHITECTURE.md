# StereoFace — Arquitectura

Estado: diseño aprobado en la fase 1; implementación por fases (ver `PROGRESS.md`). La dirección artística está en `docs/01-direccion-artistica.md`.

## 1. Decisiones clave

| Tema | Decisión | Por qué |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | Pedido en el brief; rutas por grupos separan público y admin |
| Estilos | Tailwind CSS 4 con tokens en `@theme` | Tokens del design system como variables CSS; sin runtime |
| ORM | **Drizzle** (no Prisma) | Sin motor binario ni paso de generación, imágenes Docker más pequeñas, SQL explícito para búsqueda full-text y consultas de agenda, ideal para un servidor pequeño. Prisma 8 aún está en versión candidata |
| Base de datos | PostgreSQL 16 con `pg_trgm` y `tsvector` | Búsqueda en español sin servicio extra |
| Colas | Redis + BullMQ, proceso `worker` aparte | Los trabajos largos nunca corren en una petición HTTP |
| Medios | Almacenamiento compatible con S3 (MinIO en local) | Mismo código en local y producción |
| Auth | Sesiones en base de datos, cookie HttpOnly + SameSite=Lax, hash argon2id | Revocables; RBAC verificado en servidor |
| Validación | Zod en cada frontera (formularios, API, conectores, IA) | Un solo esquema por contrato |
| Editor | Tiptap, contenido guardado como JSON + HTML saneado | Bloques propios (galería, cita, embed) |
| Animación | GSAP + ScrollTrigger solo donde aporta; CSS para el resto | Rendimiento y `prefers-reduced-motion` |
| IA | Interfaz `AiProvider` con adaptadores | Proveedor intercambiable y control de costo |

Se descartan por ahora: microservicios, GraphQL, Elasticsearch, estado global en cliente. TanStack Query solo en el admin donde haya sondeo (estado de colas).

## 2. Estructura del repositorio

```
src/
  app/
    (public)/        portal: inicio, noticias, artículos, artistas, lanzamientos, agenda
    (admin)/admin/   CMS bajo /admin
    api/             rutas finas que delegan en servicios
  modules/           dominio, uno por carpeta
    content/ artists/ releases/ events/ taxonomy/ media/ users/ settings/
    ingest/          conectores, pipeline, deduplicación, reglas
    ai/              adaptadores de proveedor, prompts, control de costo
  lib/               db, auth, rbac, storage, queue, seo, logger
  ui/                design system: tokens, primitivos, layouts, motion
worker/              proceso BullMQ: sincronización, pipeline, programación
infra/               Dockerfiles, nginx, backups
docs/
```

Regla de dependencias: `app → modules → lib`. Los módulos no importan de `app` ni de `ui`. Cada módulo expone `service.ts` (casos de uso), `schema.ts` (Drizzle), `validators.ts` (Zod) y `policies.ts` (permisos).

## 3. Mapa del sitio

**Público**
- `/` Inicio
- `/noticias` listado con filtros (`?categoria=&etiqueta=&q=&pagina=`) y `/noticias/[slug]`
- `/entrevistas`, `/criticas`, `/editoriales`, `/cultura`, `/tecnologia`, `/equipos` (secciones editoriales, comparten plantilla)
- `/escena/colombia`, `/escena/latinoamerica`
- `/especiales` y `/especiales/[slug]` (layout narrativo)
- `/artistas` y `/artistas/[slug]`
- `/lanzamientos` y `/lanzamientos/[slug]`
- `/agenda` (filtros país, ciudad, género, fecha) y `/agenda/[slug]`
- `/playlists`, `/buscar`, `/newsletter`
- `/p/[slug]` páginas estáticas (manifiesto, staff, contacto, legal)
- `/rss.xml`, `/sitemap.xml`, `/robots.txt`, `/og/[...]` imágenes sociales
- Prefijo de idioma `/en/...` reservado; textos en tablas con columna `locale`

**Admin** (`/admin`): dashboard, artículos, editor, revisión de importados, categorías, etiquetas, artistas, álbumes, lanzamientos, eventos, entrevistas, páginas, medios, usuarios, **fuentes** (`/admin/fuentes`), automatización, configuración global, auditoría.

## 4. Modelo de datos inicial

Convención: `id` uuid, `created_at`, `updated_at`; borrado lógico en contenido editorial.

**Identidad y acceso**
- `user` (email, nombre, hash, rol, activo)
- `session` (user, token_hash, expira, ip, agente)
- `audit_log` (user, acción, entidad, entidad_id, diff, fecha)
- Roles: `superadmin | admin | editor | redactor | colaborador`; permisos en `lib/rbac` como matriz rol → acción:recurso.

**Contenido**
- `article` (slug, título, bajada, kicker, cuerpo_json, cuerpo_html, portada→media, autor→user, estado `borrador|revision|programado|publicado|archivado`, publicar_en, layout `estandar|especial`, categoría, locale, seo_json, origen `manual|importado`, fuente_item→source_item nullable)
- `article_revision` (article, cuerpo_json, autor, fecha) para el historial
- `category`, `tag`, `article_tag`
- `article_entity` (article, tipo `artist|release|event`, entidad_id)
- `page` (páginas estáticas), `interview` como `article` con plantilla de entrevista
- `reference` (article, título, url, medio) para fuentes citadas

**Música**
- `artist` (slug, nombre, bio, país, foto→media, enlaces_json)
- `genre`, `artist_genre`
- `release` (slug, título, tipo `album|ep|single|remix|video|set|podcast`, artista(s), fecha, portada, sello, embed_url permitido)
- `release_artist`
- `event` (slug, nombre, tipo, inicio, fin, venue, ciudad, país, descripción, url_entradas, estado)
- `event_artist`

**Medios y configuración**
- `media` (clave S3, mime, ancho, alto, alt, créditos, licencia, autor)
- `site_setting` (clave, valor_json): nombre, logo, colores, menú, redes, SEO global, footer, bloques de portada
- `home_block` (posición, tipo, referencia, activo)
- `subscriber` (email, estado, confirmado_en)

**Motor de noticias**
- `source` (nombre, tipo `rss|atom|api|ical|manual`, url, frecuencia_min, categorías_default, `rights_policy` `solo_metadatos|licenciado|permiso_expreso`, `publish_policy` `siempre_revision|autopublicar`, activa, pausada, límite_diario, términos_verificados_en, notas_legales)
- `source_run` (source, inicio, fin, estado, nuevos, duplicados, errores, log)
- `source_item` (source, guid, url, título, resumen_autorizado, publicado_en, hash_contenido, idioma, género, categoría, relevancia, estado `descubierta|procesando|pendiente|aprobada|programada|publicada|rechazada|error`, article nullable, error) con índice único `(source, guid)`
- `source_item_embedding` (vector para duplicados semánticos; `pgvector` opcional, con fallback a `pg_trgm`)
- `ai_usage` (proveedor, modelo, tokens, costo, fecha) para topes diarios

## 5. Motor de noticias (diseño)

Un job BullMQ por fuente, programado según `frecuencia_min`, con `jobId` determinista (`source:{id}:{ventana}`) para idempotencia. Etapas como trabajos encadenados: `fetch → normalize → detect-language → classify → extract-entities → dedupe → score → propose → attribute → route → index`. Cada etapa escribe su resultado en `source_item`, así un reinicio reanuda desde la última etapa completada.

Política de derechos (invariante del sistema, verificada en el servicio, no solo en la UI):
- `solo_metadatos`: se guarda título, extracto autorizado, enlace y atribución; la IA genera solo una **ficha breve** original con enlace al original. Nunca se republica ni se parafrasea el cuerpo.
- `licenciado` / `permiso_expreso`: permiten artículo desarrollado.
- `autopublicar` solo si la fuente lo tiene y el tipo de contenido es ficha o agenda; el resto va a revisión.
- La IA recibe únicamente metadatos y debe devolver JSON validado con Zod; si falta un dato, devuelve `null`. No se aceptan citas, fechas ni eventos que no estén en la entrada.
- Reintentos con backoff exponencial, límite de tasa por dominio, topes diarios de importación y de costo de IA, pausa automática tras N fallos.

Antes de activar cada fuente real (RA, Mixmag, DJ Mag, Pitchfork, etc.) se verifica su RSS/API, términos y licencia y se anota en `terminos_verificados_en`. Hasta entonces las fuentes se crean desactivadas.

## 6. Seguridad
Control de acceso en servidor por política (`can(user, action, resource)`) en cada caso de uso; Zod en todas las entradas; HTML saneado con lista blanca al guardar y al renderizar; límites y tipos MIME reales en subidas con claves aleatorias; límite de tasa en login y API; CSRF mediante SameSite y verificación de origen en mutaciones; secretos solo por variables de entorno; auditoría de acciones de admin; backups diarios con `pg_dump`.

## 7. Despliegue
Docker Compose en un solo servidor (objetivo: VPS de 2 vCPU y 2–4 GB). Procedimiento completo, comprobaciones y reglas en **DEPLOY.md**.

- **Servicios:** `db` (PostgreSQL 17, sin puertos publicados), `migrate` (tarea única: migraciones + datos base + primer superadministrador), `web` (Next.js `standalone`, usuario sin privilegios, healthcheck `/api/health`), `nginx` (TLS, HSTS, límites de tasa, sobrescribe `X-Forwarded-For`), `certbot` (perfil `tls`) y `backup` (`pg_dump` diario con retención).
- **Imagen:** `Dockerfile` multi-etapa (node:24-alpine). `NEXT_PUBLIC_SITE_URL` se incrusta al compilar. `scripts/migrate-prod.ts` se empaqueta con esbuild a `dist/migrate.mjs` (no necesita devDependencies).
- **Guarda de producción:** sin `DATABASE_URL`, `getDb()` lanza error en producción (PGlite solo con `ALLOW_PGLITE=1`, no usar). El seed demo está bloqueado en producción; `seedBase` (categorías, géneros, The Lot Radio desactivada, ajustes) es idempotente.
- **Rutas operativas:** `/api/health` (la oculta Nginx hacia fuera), `/robots.txt`, `/sitemap.xml` (dinámico), `/rss.xml`.
- **No incluido a propósito:** Redis, worker (motor de noticias) y MinIO/S3 (módulo de medios): aún no existe código que los use. Se añadirán con esas fases.
- **Estado de verificación:** la build standalone y la ruta `pg` se probaron en local (contra PGlite con socket); Dockerfile, Compose, Nginx, TLS y copias **no se han ejecutado** (ver DEPLOY.md, sección 2).

## 8. Roadmap

| Fase | Entrega | Estado |
|---|---|---|
| 1 | Investigación, dirección, arquitectura | hecho |
| 2 | Design system (tokens, primitivos, motion) | en curso |
| 3 | Portal público (inicio primero) | inicio en curso |
| 4 | Esquema Drizzle, servicios, validaciones, seeds | hecho (69 pruebas) |
| 5 | Auth, RBAC, CMS, editor Tiptap | hecho para artículos y radio; faltan CRUD de artistas, lanzamientos, eventos, usuarios, medios y ajustes |
| 6 | Conectores, colas, IA, revisión | pendiente |
| 7 | SEO, accesibilidad, rendimiento | pendiente |
| 8 | Docker, pruebas, seguridad, documentación | pendiente |

Cada fase termina con pruebas del alcance y verificación en navegador cuando aplica.

## 9. StereoFace Frequencies (radio persistente)

**Principio legal y técnico:** el NAVEGADOR de cada persona se conecta directamente al origen de la señal. El servidor guarda solo metadatos y el enlace; **no descarga, almacena, retransmite ni hace de proxy** de señales de terceros (no existe ninguna ruta que lo haga).

- **Datos** (`modules/radio`): `radio_stations` (tipo `hls | direct | embed`, URL https, atribución obligatoria, `authorization_status`, evidencia, `enabled`) y `radio_station_genres`. Restricciones `CHECK` en la base: no se puede activar sin autorización (`granted`/`not_required`) ni sin fuente, aunque se salte la aplicación.
- **Reglas** (`modules/radio/service.ts`, probadas): nace desactivada y `pending`; activar exige autorización + fuente; quitar la autorización desactiva; **cambiar la URL de una emisora activa la desactiva**; el listado público nunca incluye evidencia interna.
- **Permisos** (`lib/rbac.ts`, recurso `station`): editor crea y edita; solo admin y superadmin activan (`publish`) y cambian la autorización (`manage`).
- **API pública:** `GET /api/radio/stations` (solo emisoras activas y autorizadas; `s-maxage=30` para que una baja se propague en ~1 min).
- **Reproductor** (`ui/radio`): `RadioProvider` + `RadioBar` en el **layout raíz**, así no se desmonta al navegar. HLS con `hls.js` (carga diferida) donde hay MSE y reproducción nativa en Safari/iOS; flujo directo con un `<video>` oculto. Nunca reproduce solo (solo desde un gesto). Estados: listo, conectando, conectado, pausado, reconectando n/5 (backoff exponencial; reintento al volver la red), sin conexión, error con «Reintentar». Media Session para controles del sistema. Tras una pausa larga reconecta al directo.
- **Visualizador:** usa `AnalyserNode` solo si hay acceso real a los datos (HLS por hls.js, o flujo directo con CORS declarado). Si no recibe señal lo dice («Sin acceso a datos de audio»); no dibuja animación decorativa. Con `prefers-reduced-motion` se detiene y lo indica.
- **Atribución:** siempre visible («Señal: emisora ↗») en la barra y el panel; los campos son obligatorios.
- **The Lot Radio:** registro **desactivado, con autorización pendiente y sin URL de señal** (`db/seed-radio.ts`). Para activarla hace falta (1) permiso escrito de retransmisión o un reproductor oficial integrable, (2) cargar la URL o `embedUrl` (si su host no está permitido, añadirlo a `RADIO_EMBED_HOSTS`), (3) registrar la evidencia en `/admin/radio/<id>` y (4) activarla.
- **Embeds:** solo hosts de la lista permitida más `RADIO_EMBED_HOSTS`; `iframe` con `sandbox`.

## 10. Autenticación y administración (primer corte)

- Contraseñas con **scrypt** (N=2^16, sin dependencias nativas; sustituye al argon2id previsto en la sección 1: KDF de memoria dura equivalente). Mínimo 12 caracteres.
- Sesiones en base de datos: solo se guarda el **hash** del token; cookie `sf_session` HttpOnly, SameSite=Lax, `Secure` en producción; 7 días. Rate limit por IP y por correo; error genérico; verificación de relleno para igualar tiempos.
- La sesión se valida en el servidor en cada petición dentro de `<Suspense>` (requisito de Cache Components). Cada acción vuelve a verificar el permiso (`assertCan`).
- Primer administrador: `ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create` (la contraseña solo por entorno).

## 11. Base de datos

Drizzle + PostgreSQL. Con `DATABASE_URL` usa `pg`; sin ella, en desarrollo usa **PGlite** (PostgreSQL en WebAssembly, un solo proceso: **no usar en producción**). Migraciones en `drizzle/` (`npm run db:generate`, `db:migrate`); datos demo con `npm run db:seed` (todo marcado `is_demo`).

## 12. CMS de artículos y editor

- **Editor Tiptap** (`ui/admin/TiptapEditor.tsx`): títulos H2-H4, negrita/cursiva/subrayado, enlaces (https o mailto), listas, cita y **cita destacada**, separador, imágenes (https + texto alternativo), **galería** de 2 a 6 imágenes, **video/audio incrustado** de proveedores oficiales (YouTube sin cookies, Vimeo, Spotify, SoundCloud, Mixcloud, Bandcamp) y tablas. Nodos propios en `ui/admin/tiptap-extensions.ts`.
- **Seguridad:** el HTML que se renderiza en el sitio es **siempre** el saneado en el servidor (`lib/sanitize.ts`, lista blanca): sin scripts, estilos en línea ni manejadores de eventos; enlaces https/mailto con `rel` seguro; imágenes solo https; iframes solo de hosts permitidos y forzados a `sandbox`; clases limitadas. El JSON de Tiptap solo sirve para reabrir el editor. 11 pruebas de vectores XSS.
- **Guardado:** autoguardado a los 2,5 s en borradores y revisiones (los publicados se guardan a mano para no cambiar el sitio en vivo sin querer), control de conflictos con `expectedUpdatedAt`, aviso al salir con cambios, **historial de versiones** (50 por artículo) con restauración, **vista previa** con el mismo HTML saneado que ve el público.
- **Flujo y permisos** (servidor): redactor/colaborador solo editan sus borradores y envían a revisión; editor y superiores publican, programan, archivan y borran. Publicar exige contenido y categoría.
- **Programación:** un artículo `scheduled` pasa a ser público solo cuando llega su fecha (la consulta pública lo evalúa; no depende de un proceso en segundo plano).
- **SEO por artículo:** título, descripción, canónica, `noindex`, Open Graph, JSON-LD `NewsArticle` y `BreadcrumbList`, migas de pan.
- **Público:** `/noticias` (categorías, búsqueda de texto completo en español, paginación) y `/noticias/[slug]` (portada, titular, bajada, firma, fecha, tiempo de lectura, cuerpo en serif, etiquetas, compartir, fuentes y referencias, relacionados). La portada enlaza a estas páginas.
- **Administración:** `/admin/articulos` (filtros, paginación), `/admin/articulos/nuevo`, `/admin/articulos/[id]`.
