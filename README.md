# StereoFace

Revista digital de música electrónica e indie: portal editorial, panel de administración con CMS (editor Tiptap), radio persistente («StereoFace Frequencies»), SEO (sitemap, RSS, JSON-LD) y despliegue con Docker.

Stack: Next.js 16 (App Router, Cache Components, salida `standalone`), React 19, TypeScript estricto, Tailwind 4, GSAP, Drizzle ORM + PostgreSQL, Zod, Tiptap, hls.js, Vitest.

## Documentación

| Documento | Para qué |
|---|---|
| [DEPLOY.md](DEPLOY.md) | **Despliegue en producción**, paso a paso, escrito para que lo ejecute otra IA o una persona. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Decisiones, modelo de datos, seguridad, radio, autenticación, CMS. |
| [PROGRESS.md](PROGRESS.md) | Estado real: qué está hecho y verificado, qué no, limitaciones. |
| [docs/01-direccion-artistica.md](docs/01-direccion-artistica.md) | Dirección de arte («Neon Signal»). |

## Desarrollo local

Requisitos: Node 22 o superior (se usa 24) y npm. **No hace falta PostgreSQL ni Docker**: sin `DATABASE_URL`, en desarrollo se usa PGlite (PostgreSQL en WebAssembly, datos en `.data/pglite`).

```bash
npm install
npm run db:seed            # opcional: datos base + contenido DEMO ficticio (solo desarrollo)
npm run dev                # http://localhost:3000 (las migraciones se aplican solas con PGlite)
```

Primer administrador local (la contraseña solo por entorno, mínimo 12 caracteres):

```bash
ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD='una-clave-larga-123' npm run admin:create
```
El panel está en `/admin/login`.

### Scripts

| Comando | Función |
|---|---|
| `npm run dev` / `build` / `start` | Next.js. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | 97 pruebas (Vitest sobre PGlite en memoria con las mismas migraciones). |
| `npm run db:generate` | Genera una migración Drizzle desde el esquema. |
| `npm run db:migrate` / `db:seed` / `db:reset` | Migrar, sembrar demo (solo desarrollo), reiniciar la base local. |
| `npm run build:migrate` | Empaqueta `dist/migrate.mjs`, el script de arranque de producción. |

### Con PostgreSQL real

Define `DATABASE_URL=postgres://usuario:clave@host:5432/base`. En producción es **obligatoria**: la aplicación se niega a arrancar sin ella.

## Contenido demo

La portada de desarrollo usa datos ficticios marcados como demo en la base. El seed demo **no se ejecuta en producción**.

## Radio

Ninguna emisora de terceros está activa. The Lot Radio está registrada **desactivada** a la espera de autorización escrita del titular. El servidor nunca descarga ni retransmite señales ajenas: el navegador se conecta directamente al origen. Detalle en la sección 9 de ARCHITECTURE.md.

## Nota para agentes

`AGENTS.md` advierte que esta versión de Next.js tiene cambios incompatibles con versiones anteriores: consulta `node_modules/next/dist/docs/` antes de tocar convenciones del framework.
