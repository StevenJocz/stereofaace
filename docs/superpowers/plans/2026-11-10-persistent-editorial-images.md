# Persistent Editorial Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let editors upload persistent, attributed images for article covers and bodies, require images on new publications, and apply the two approved identity-text updates.

**Architecture:** The Node-runtime app writes immutable image objects to `/data/media` in a named Docker volume and records metadata in the existing `media` table. Authenticated upload and public delivery routes are backed by that table; articles keep `cover_id` and Tiptap inserts the returned local URL.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle/PostgreSQL, Tiptap, Zod, Docker Compose, Vitest, `image-size`.

**Spec:** `docs/superpowers/specs/2026-11-10-media-local-design.md`

## Global Constraints

- Accept only JPEG, PNG, WebP and AVIF, maximum 10 MiB, matching declared MIME and magic bytes; reject SVG/GIF.
- Require alt text, credit and license/permission for every upload (`Propia` is accepted for own work).
- Use named volume `stereoface_media` at `/data/media`; never use an original filename as a path.
- Upload requires `media:create`; public retrieval only resolves an existing UUID key in PostgreSQL.
- New publishing/scheduling requires a cover and one controlled media image in the body. Existing published posts stay public until edited.
- Preserve external HTTPS covers/generative art compatibility, and never import third-party publication images.
- Do not alter radio or authorization data.

## Review Focus

- Spoofed image MIME or magic bytes is rejected before creating a file or record (Task 1).
- Traversal or unknown public media keys result in 404 without filesystem access (Task 2).
- Write/DB failure cleans the temporary file (Task 1).
- New publication without cover/body image returns field errors (Task 3).
- A role without `media:create` cannot cause persistent storage changes (Task 2).

---

## File structure

- `src/modules/media/validation.ts`, `storage.ts`, `service.ts`: validation, atomic volume operations and data access.
- `src/app/api/media/route.ts`, `src/app/media/[key]/route.ts`: authenticated upload and controlled public delivery.
- `src/modules/content/{validators,admin,service}.ts`, `src/lib/sanitize.ts`, `src/app/(public)/noticias/[slug]/page.tsx`: article relation, enforcement and SEO rendering.
- `src/ui/admin/MediaUpload.tsx`, `ArticleEditor.tsx`, `TiptapEditor.tsx`: editor upload controls.
- `src/ui/Footer.tsx`, `src/app/(public)/page.tsx`: requested identity copy.
- `docker-compose.yml`, `DEPLOY.md`: named volume and backup/restore steps.
- `tests/media.test.ts`, `tests/{articles,content,sanitize}.test.ts`: regression coverage.

### Task 1: Media validation, persistence and access service

**Files:**
- Create: `src/modules/media/validation.ts`
- Create: `src/modules/media/storage.ts`
- Create: `src/modules/media/service.ts`
- Modify: `package.json`, `package-lock.json`
- Test: `tests/media.test.ts`

**Interfaces:**
- Produces `createUploadedMedia(db, actor, file, metadata): Promise<StoredMedia>` and `getPublicMedia(db, storageKey): Promise<PublicMedia | null>`.

- [ ] Write failing tests for valid JPEG/PNG/WebP/AVIF, spoofed MIME, 10 MiB limit, unsafe key, permission denial and temporary-file cleanup.
- [ ] Run `npm test -- tests/media.test.ts`; expect failing imports.
- [ ] Add `image-size`; implement magic-byte validation and dimensions. Write random UUID-keyed files atomically under `MEDIA_ROOT` (default `/data/media`), insert the existing `media` metadata row only after persistence, and clean up on failure.
- [ ] Run `npm test -- tests/media.test.ts`; expect PASS.
- [ ] Commit: `feat: add persistent media storage`.

### Task 2: Upload and public-delivery routes

**Files:**
- Create: `src/app/api/media/route.ts`
- Create: `src/app/media/[key]/route.ts`
- Test: `tests/media.test.ts`

**Interfaces:**
- Consumes Task 1 services.
- Produces `POST /api/media -> { id, url, alt, credit, license, width, height }` and `GET /media/:key`.

- [ ] Add failing tests for unauthenticated/forbidden upload, malformed FormData, successful upload, unknown/traversal key, MIME and immutable cache header.
- [ ] Run `npm test -- tests/media.test.ts`; expect failure.
- [ ] Implement `runtime = "nodejs"`: POST accepts `file`, `alt`, `credit`, `license`, invokes `requireUser` and Task 1; GET accepts UUID keys only, uses metadata lookup before opening a file, sets stored `Content-Type` and `Cache-Control: public, max-age=31536000, immutable`.
- [ ] Run `npm test -- tests/media.test.ts`; expect PASS.
- [ ] Commit: `feat: expose authenticated media upload`.

### Task 3: Article integration, publication guard and SEO

**Files:**
- Modify: `src/modules/content/validators.ts`, `src/modules/content/admin.ts`, `src/modules/content/service.ts`
- Modify: `src/lib/sanitize.ts`, `src/app/(public)/noticias/[slug]/page.tsx`
- Test: `tests/articles.test.ts`, `tests/content.test.ts`, `tests/sanitize.test.ts`

**Interfaces:**
- Adds `coverId` to article inputs and exposes resolved local `coverUrl` to public view models.

- [ ] Add failing tests: local cover resolves to `/media/<uuid>`, `og:image`/`NewsArticle.image` receive that URL, sanitizer preserves only controlled local media URLs, and a new published/scheduled article lacking a cover/body image is rejected.
- [ ] Run `npm test -- tests/articles.test.ts tests/content.test.ts tests/sanitize.test.ts`; expect failure.
- [ ] Validate `coverId` against `media`, retain approved legacy external covers, and require one safe local image in body HTML for new publication transitions. Grandfather existing published articles until they are edited. Do not broaden sanitizer protocols.
- [ ] Run the same test command; expect PASS.
- [ ] Commit: `feat: require editorial images for new publications`.

### Task 4: CMS cover and in-body upload workflow

**Files:**
- Create: `src/ui/admin/MediaUpload.tsx`
- Modify: `src/ui/admin/ArticleEditor.tsx`, `src/ui/admin/TiptapEditor.tsx`, `src/app/(admin)/admin/(panel)/articulos/[id]/page.tsx`
- Test: `tests/articles.test.ts`

**Interfaces:**
- Consumes Task 2 upload response.
- Produces `onUploaded(media: UploadedMedia)`; cover `coverId`; a Tiptap `image` using returned `url` and `alt`.

- [ ] Write a failing payload test covering `coverId` and a returned media URL inside `bodyHtml`.
- [ ] Run `npm test -- tests/articles.test.ts`; expect failure.
- [ ] Implement accessible native-file upload UI with required alt/credit/license, preview and server errors. Use it in the cover section and the toolbar’s Image action. Retain an explicitly labeled legacy external URL field for older material.
- [ ] Run `npm test -- tests/articles.test.ts && npm run typecheck && npm run lint`; expect all exit 0.
- [ ] Commit: `feat: upload article cover and body images`.

### Task 5: Identity copy and persistent production deployment

**Files:**
- Modify: `src/app/(public)/page.tsx`
- Modify: `src/ui/Footer.tsx`
- Modify: `docker-compose.yml`, `DEPLOY.md`
- Modify on deployment: `/opt/stereoface/docker-compose.yml`
- Test: `tests/media.test.ts`

**Interfaces:**
- Consumes `stereoface_media:/data/media`.
- Produces image persistence across container recreation and updated public identity copy.

- [ ] Replace `«Cita de demostración: aquí iría una frase destacada de una entrevista real.»` with `Creado por Steven Jocz` and replace footer copy `Identidad provisional editable desde el administrador` with `Creado por Steven Jocz`.
- [ ] Add and mount named `stereoface_media` on `web`; document backup/restoration of that volume alongside PostgreSQL. Ensure the non-root app user can write its mount path.
- [ ] Run `npm test && npm run typecheck && npm run lint && npm run build`; expect every command exit 0.
- [ ] Deploy: `docker compose build migrate && docker compose run --rm migrate && docker compose up -d web`; confirm migration and health check succeed.
- [ ] Upload an owned/licensed image, publish an article containing it as cover/body, recreate `web`, and verify the identical `/media/<uuid>` URL remains HTTP 200. Do not delete the validation article without user approval.
- [ ] Commit: `docs: document persistent media deployment`.

## Self-review

- Tasks 1–2 cover secure upload/storage/delivery; Task 3 connects data, SEO and publish rules; Task 4 provides the required editor behavior; Task 5 makes the volume durable and updates the two requested strings.
- Tests cover MIME spoofing, permission, traversal, cleanup, publication guard, sanitizer compatibility, and persistence after recreation.
- Existing live articles deliberately remain readable; the CMS makes images mandatory only when newly publishing or updating an article, because no third-party photos are copied automatically.
