# Administrador completo de StereoFace — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el superadministrador gestione desde `/admin` todo el contenido que muestra la web (portada, artistas, lanzamientos, agenda, taxonomía, medios, suscriptores, ajustes, páginas, usuarios, auditoría, fuentes).

**Architecture:** Cada sección es un módulo de servicio (`src/modules/<x>/admin.ts`) con `assertCan` + Zod + `recordAudit`, más páginas de servidor en `src/app/(admin)/admin/(panel)/<ruta>` y formularios cliente con `useActionState`. Un helper común (`src/lib/admin/form.ts`) concentra el manejo de errores de las acciones; la navegación se declara en un solo arreglo (`src/ui/admin/nav.ts`) al que cada tarea añade su entrada.

**Tech Stack:** Next.js 16.4 (App Router, Server Actions, Cache Components), React 19, Drizzle + PGlite/pg, Zod 4, Tiptap, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-admin-completo-design.md`

## Global Constraints

- Next.js aquí **no es el que conoces** (AGENTS.md): antes de usar caché, route handlers o `revalidate*`, lee la guía relevante en `node_modules/next/dist/docs/`.
- Texto de interfaz en español, mismo tono que `radio/`. **No cambiar el diseño público**: solo pasa a leerse de la base de datos lo que hoy es texto fijo.
- Cada función de servicio que escribe llama `assertCan(actor, "<recurso>:<acción>")` primero y `recordAudit(...)` al final, y recibe `(db: Db, actor: Actor | null, ...)`. Nunca guardar secretos en `diff`.
- Archivos `"use server"` solo exportan funciones `async` (los tipos van en otro archivo). `redirect()` va fuera de `try/catch`.
- Borrado lógico (`deleted_at`) en artistas, lanzamientos y eventos; borrado real solo en suscriptores, medios sin uso y taxonomía sin uso. Borrar algo en uso lanza `DomainError("in_use", …)` con el número de usos, nunca un error de FK.
- Sin migraciones de BD: si una tarea cree necesitar una, detenerse y avisar.
- El proyecto no es un repositorio git: los pasos de cierre son **verificaciones**, no commits.
- Pruebas: `npx vitest run tests/<archivo>` con `makeDb()` de `tests/helpers.ts`; al final de cada tarea `npx tsc --noEmit` y `npx eslint <archivos tocados>` sin errores.

## Review Focus

1. Borrar medio/categoría/género en uso → `DomainError("in_use")` con conteo (no 500 por FK) — Tareas 2 y 7.
2. Slug repetido al crear/editar artista, lanzamiento o evento → se genera `slug-2` en vez de fallar — Tareas 4–6.
3. Degradar o desactivar al **último superadmin activo** debe rechazarse; un admin no asigna/retira `superadmin` — Tarea 10.
4. Exportar suscriptores con correos que empiezan por `= + - @` no debe permitir inyección de fórmulas en Excel — Tarea 8.
5. Slide de portada cuyo artículo se despublica/borra: el admin lo marca y la portada pública no se rompe — Tarea 3.
6. Roles sin permiso (editor en usuarios, redactor en portada) reciben `ForbiddenError` y la página redirige/oculta — todas.

---

### Task 1: Base común, navegación agrupada y panel de inicio

**Files:**
- Create: `src/lib/admin/form.ts`, `src/lib/admin/slug.ts`, `src/ui/admin/fields.tsx`, `src/ui/admin/nav.ts`, `src/modules/dashboard/service.ts`
- Modify: `src/app/(admin)/admin/(panel)/layout.tsx`, `src/app/(admin)/admin/(panel)/page.tsx`
- Test: `tests/admin-dashboard.test.ts`, `tests/admin-slug.test.ts`

**Interfaces:**
- Produces:
  - `type FormState = { ok?: boolean; message?: string; errors?: FieldErrors; values?: Record<string, string | string[]>; nonce?: number } | null` (igual que el de `radio/actions.ts`).
  - `str(fd: FormData, k: string): string | undefined`, `strs(fd, k): string[]`, `snapshot(fd): Record<string, string | string[]>`.
  - `guard(fd: FormData, label: string, work: () => Promise<string | void>): Promise<FormState>` — traduce `ZodError`/`ForbiddenError`/`DomainError`/inesperado como `radio/actions.ts`, y llama `revalidatePath("/admin", "layout")` y `revalidatePath("/")` en éxito.
  - `uniqueSlug(db: Db, table, base: string, fallback: string, exceptId?: string): Promise<string>` — devuelve `base`, o `base-2`…`base-21`, o `base-<timestamp36>`; `table` es cualquier tabla Drizzle con `id` y `slug`.
  - `Field`, `Message`, `PageHead({eyebrow, title, action?})`, `ConfirmDelete` (cliente; exige escribir `BORRAR`) en `src/ui/admin/fields.tsx`.
  - `ADMIN_NAV: { group: string; items: { href: string; label: string; permission: Permission }[] }[]` — arranca con Contenido→Artículos, Audiencia→Radio; cada tarea añade su entrada.
  - `getDashboardStats(db: Db, actor: Actor | null): Promise<DashboardStats>` con `{ articles: Record<ArticleState, number>; artists: number; releases: number; eventsUpcoming: number; subscribers: Record<SubscriberState, number>; stations: { total: number; enabled: number }; recentAudit: { action: string; entity: string; userName: string | null; createdAt: Date }[] }` (requiere `dashboard:read`).

- [ ] **Step 1: Tests.** `admin-slug.test.ts`: con un artista `slug="dj-x"` ya creado, `uniqueSlug(db, artists, "dj-x", "artista")` → `"dj-x-2"`; con `exceptId` del propio artista → `"dj-x"`; base vacía → `"artista"`. `admin-dashboard.test.ts`: con seed demo, `getDashboardStats` devuelve `artists > 0`, `recentAudit` es arreglo, y un actor `colaborador` lanza `ForbiddenError`.
- [ ] **Step 2:** `npx vitest run tests/admin-slug.test.ts tests/admin-dashboard.test.ts` → FAIL (módulos inexistentes).
- [ ] **Step 3:** Implementar los archivos de *Produces*. `guard` se extrae de `radio/actions.ts` (copiar la lógica; no tocar radio). `Field`/`Message` se extraen de `ui/admin/StationForms.tsx` con idéntico marcado.
- [ ] **Step 4:** Re-ejecutar los tests → PASS.
- [ ] **Step 5:** `layout.tsx`: renderizar `ADMIN_NAV` agrupado, filtrando por `can(user.role, item.permission)`; la barra sigue desplazable en móvil. `page.tsx`: tarjetas con las cifras de `getDashboardStats` (cada una enlaza a su sección solo si ya está en `ADMIN_NAV`) y lista de últimos cambios; quitar los textos «disponible en la siguiente fase».
- [ ] **Step 6: Verificación.** `npx tsc --noEmit`, eslint de lo tocado, y abrir `/admin` con un superadmin local: se ven las cifras y no hay enlaces rotos.

### Task 2: Biblioteca de medios y selector

**Files:**
- Create: `src/modules/media/admin.ts`, `src/app/(admin)/admin/(panel)/medios/page.tsx`, `src/app/(admin)/admin/(panel)/medios/actions.ts`, `src/ui/admin/MediaPicker.tsx`, `src/ui/admin/MediaLibrary.tsx`
- Modify: `src/app/api/media/route.ts` (añadir `GET`), `src/ui/admin/nav.ts`
- Test: `tests/admin-media.test.ts`

**Interfaces:**
- Consumes: `StoredMedia`, `createUploadedMedia` de `src/modules/media/service.ts`; `Field`, `guard`, `ConfirmDelete` (Tarea 1).
- Produces:
  - `listMediaAdmin(db, actor, q: { search?: string; page?: number }): Promise<{ items: (StoredMedia & { createdAt: Date; usedBy: number })[]; total: number; pageSize: number }>` (`media:read`).
  - `updateMediaMeta(db, actor, id: string, raw: unknown /* {alt, credit, license} cada uno 1–200 */): Promise<void>` (`media:update`).
  - `deleteMedia(db, actor, id: string, opts?: { root?: string }): Promise<void>` (`media:delete`): cuenta usos en `artists.photoId`, `releases.coverId`, `articles.coverId` y artículos cuyo `coverUrl`/`bodyHtml` contenga `/media/<storageKey>`; si >0 lanza `DomainError("in_use", "En uso en N lugares")`; si no, borra la fila y el archivo (`removeStoredMedia`).
  - `GET /api/media?search=&page=` → `{ items, total }` (exige `media:read`).
  - `<MediaPicker name: string; label: string; initial?: { id: string; url: string } />` (cliente): input oculto `name` con el id del medio; abre la biblioteca (rejilla + búsqueda) o sube uno nuevo con el `MediaUpload` existente.

- [ ] **Step 1: Tests.** (a) `updateMediaMeta` cambia alt y audita; (b) `deleteMedia` de un medio referenciado por un artista → `DomainError` con código `in_use`; (c) referenciado solo desde `articles.bodyHtml` → también `in_use`; (d) medio libre se borra de BD y del disco (usar `root` temporal); (e) `colaborador` no puede borrar (`ForbiddenError`).
- [ ] **Step 2:** Ejecutar → FAIL.
- [ ] **Step 3:** Implementar `admin.ts`; `pageSize` 24; búsqueda `ilike` sobre alt/crédito escapando `%` y `_`.
- [ ] **Step 4:** Ejecutar → PASS.
- [ ] **Step 5:** Página `/admin/medios` (rejilla con miniatura, edición de metadatos, usos, borrar con `ConfirmDelete`, subir nuevo); `GET` en la ruta API; `MediaPicker`; entrada en `ADMIN_NAV` (Organización→Medios, `media:read`).
- [ ] **Step 6: Verificación.** tsc + eslint + subir una imagen en el navegador, editar su alt y comprobar que borrarla en uso falla con el mensaje.

### Task 3: Portada (hero y destacados)

**Files:**
- Create: `src/modules/content/home-blocks.ts`, `src/modules/content/home-blocks-validators.ts`, `src/app/(admin)/admin/(panel)/portada/page.tsx`, `.../portada/actions.ts`, `src/ui/admin/HomeBlockForms.tsx`
- Modify: `src/ui/admin/nav.ts`, `src/modules/content/service.ts` (solo si `getHomeData` falla con artículo no público; ver Step 1)
- Test: `tests/admin-home-blocks.test.ts`

**Interfaces:**
- Consumes: tabla `homeBlocks`, `HeroConfig`, `splitHeroTitle`.
- Produces (permiso `article:publish`):
  - `heroConfigSchema` (Zod): `lines: string[1..6]` (cada una ≤40), `accentFrom: int ≥0`, `phrase?`, `place?`, `cta?`, `meta?`, `path?: [string,string,string]`, `figure?: boolean`.
  - `listHomeBlocksAdmin(db, actor): Promise<{ id: string; kind: HomeBlockKind; position: number; active: boolean; config: HeroConfig | {}; article: { id: string; title: string; status: ArticleState; deleted: boolean }; problem: "unpublished" | "deleted" | null }[]>`.
  - `saveHomeBlock(db, actor, raw: { id?: string; kind: HomeBlockKind; articleId: string; config?: unknown; active?: boolean }): Promise<{ id: string }>` — el artículo debe existir y estar publicado, si no `DomainError("bad_article")`; nuevo bloque se añade al final de su `kind`.
  - `moveHomeBlock(db, actor, id: string, direction: "up" | "down"): Promise<void>` — intercambia posiciones respetando el índice único `(kind, position)` (usar posición temporal negativa).
  - `removeHomeBlock(db, actor, id: string): Promise<void>` — borra y recompacta posiciones.

- [ ] **Step 1: Tests.** (a) crear hero con artículo publicado OK, con borrador → `DomainError`; (b) `moveHomeBlock` intercambia sin violar el índice único y no hace nada en los extremos; (c) `removeHomeBlock` recompacta (0,1,2 → 0,1); (d) `listHomeBlocksAdmin` marca `problem:"unpublished"` cuando el artículo se despublica; (e) tras despublicar el artículo de un hero, `getHomeData` no lanza y omite ese slide; (f) redactor → `ForbiddenError`.
- [ ] **Step 2:** Ejecutar → FAIL. **Step 3:** Implementar (si (e) falla, filtrar en `blocksOf` por `isPublic`). **Step 4:** → PASS.
- [ ] **Step 5:** Página `/admin/portada`: dos listas (Hero, Destacados) con subir/bajar, activar/desactivar, quitar, y formulario de slide: selector de artículo publicado, líneas del titular (textarea, una por línea; botón «Dividir automáticamente» con `splitHeroTitle`), `accentFrom`, frase, ruta, botón, meta, lugar, figura. Aviso visible si no queda ningún hero activo o si un bloque tiene `problem`. Entrada en nav (Contenido→Portada).
- [ ] **Step 6: Verificación.** tsc + eslint; en el navegador reordenar slides y ver el cambio en `/`.

### Task 4: Artistas

**Files:**
- Create: `src/modules/artists/admin.ts`, `src/app/(admin)/admin/(panel)/artistas/{page.tsx,nuevo/page.tsx,[id]/page.tsx,actions.ts}`, `src/ui/admin/ArtistForm.tsx`
- Modify: `src/modules/artists/validators.ts` (añadir `photoId: z.uuid().optional()`), `src/modules/artists/service.ts` (`ArtistCard.imageUrl: string | null` desde `media.storageKey` → `/media/<key>`), `src/app/(public)/page.tsx` (mostrar `<img>` si hay `imageUrl`, si no la escena actual), `src/ui/admin/nav.ts`
- Test: `tests/admin-artists.test.ts`

**Interfaces:**
- Consumes: `artistInputSchema`, `uniqueSlug`, `MediaPicker`, `guard`.
- Produces: `listArtistsAdmin(db, actor, q: { search?: string; featured?: boolean; includeDeleted?: boolean; page?: number }): Promise<{ items: (ArtistRow & { genres: string[] })[]; total: number }>`; `getArtistAdmin(db, actor, id): Promise<(ArtistRow & { genreIds: string[] }) | null>`; `createArtist(db, actor, raw): Promise<{ id: string; slug: string }>`; `updateArtist(db, actor, id, raw): Promise<void>`; `deleteArtist(db, actor, id): Promise<void>` (soft); `restoreArtist(db, actor, id): Promise<void>`. Permisos `artist:*`.

- [ ] **Step 1: Tests.** crear con géneros y enlaces; dos con el mismo nombre → slugs `x` y `x-2`; enlace `http://` rechazado por el validador; `deleteArtist` lo saca de `listFeaturedArtists` y de `listArtistsAdmin` (aparece con `includeDeleted`); `restoreArtist` lo devuelve; `listFeaturedArtists` devuelve `imageUrl` cuando hay `photoId`; colaborador no puede crear.
- [ ] **Step 2:** FAIL. **Step 3:** implementar (reemplazar géneros en `artistGenres` como `setGenres` de radio). **Step 4:** PASS.
- [ ] **Step 5:** Páginas: lista (búsqueda, filtro destacados/borrados, estado demo), formulario con todos los campos del spec + `MediaPicker` para la foto, ilustración generativa opcional (escena/tono/semilla) y borrar/restaurar. Nav: Catálogo→Artistas.
- [ ] **Step 6: Verificación.** tsc + eslint; en el navegador crear un artista destacado con foto y verlo en la portada.

### Task 5: Lanzamientos

**Files:**
- Create: `src/modules/releases/admin.ts`, `src/app/(admin)/admin/(panel)/lanzamientos/{page.tsx,nuevo/page.tsx,[id]/page.tsx,actions.ts}`, `src/ui/admin/ReleaseForm.tsx`
- Modify: `src/ui/admin/nav.ts`, `src/modules/releases/validators.ts` (añadir `coverId: z.uuid().optional()`)
- Test: `tests/admin-releases.test.ts`

**Interfaces:**
- Consumes: `releaseInputSchema`, `embedUrlSchema`, `uniqueSlug`, `MediaPicker`.
- Produces: `listReleasesAdmin(db, actor, q: { search?: string; status?: PublishState; kind?: ReleaseKind; includeDeleted?: boolean; page?: number })`, `getReleaseAdmin(db, actor, id)` (incluye `artistIds` ordenados por `position`), `createRelease`, `updateRelease`, `setReleaseStatus(db, actor, id, status: "draft" | "published")` (requiere `release:publish`), `deleteRelease`/`restoreRelease` (soft). Permisos `release:*`.

- [ ] **Step 1: Tests.** crear con 2 artistas conserva el orden; sin artistas → ZodError; `embedUrl` de host no permitido → ZodError; slugs repetidos → `-2`; borrador no aparece en `listLatestReleases` y publicado sí; `setReleaseStatus` por redactor → `ForbiddenError`; soft delete lo oculta.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Páginas con selector múltiple ordenable de artistas (artistas no borrados), tipo, fecha, sello, reproductor (nota: «solo reproductores oficiales»), portada (`MediaPicker`), estado. Nav: Catálogo→Lanzamientos.
- [ ] **Step 6: Verificación.** tsc + eslint; crear y publicar uno y verlo en «Nuevos lanzamientos».

### Task 6: Agenda (eventos)

**Files:**
- Create: `src/modules/events/admin.ts`, `src/app/(admin)/admin/(panel)/agenda/{page.tsx,nuevo/page.tsx,[id]/page.tsx,actions.ts}`, `src/ui/admin/EventForm.tsx`
- Modify: `src/ui/admin/nav.ts`
- Test: `tests/admin-events.test.ts`

**Interfaces:**
- Consumes: `eventInputSchema`, `uniqueSlug`.
- Produces: `listEventsAdmin(db, actor, q: { search?: string; status?: EventState; upcoming?: boolean; includeDeleted?: boolean; page?: number })`, `getEventAdmin`, `createEvent`, `updateEvent`, `setEventStatus(db, actor, id, status: EventState)` (`event:publish`), `deleteEvent`/`restoreEvent` (soft). Permisos `event:*`.

- [ ] **Step 1: Tests.** fin anterior al inicio → ZodError; país en minúsculas rechazado; artistas ordenados; cancelado y borrador no salen en `listUpcomingEvents`; publicado futuro sí; evento pasado publicado no sale; slug repetido → `-2`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Páginas: campos `datetime-local` interpretados en `America/Bogota` (documentar en el hint), país como lista ISO, género, artistas, URL de entradas con aviso «enlace oficial del organizador». Nav: Catálogo→Agenda.
- [ ] **Step 6: Verificación.** tsc + eslint; crear un evento y verlo en «Agenda».

### Task 7: Taxonomía (categorías, etiquetas, géneros)

**Files:**
- Create: `src/modules/taxonomy/admin.ts`, `src/modules/taxonomy/validators.ts`, `src/app/(admin)/admin/(panel)/taxonomia/{page.tsx,actions.ts}`, `src/ui/admin/TaxonomyForms.tsx`
- Modify: `src/ui/admin/nav.ts`
- Test: `tests/admin-taxonomy.test.ts`

**Interfaces:**
- Produces: `type TaxonomyKind = "category" | "tag" | "genre"`; `listTaxonomy(db, actor, kind): Promise<(Row & { usage: number })[]>` (`usage` = artículos / artículos / artistas+eventos+emisoras que la usan); `saveTaxonomy(db, actor, kind, raw: { id?: string; name: string; slug?: string; description?: string; color?: string; position?: number; family?: string }): Promise<{ id: string }>`; `deleteTaxonomy(db, actor, kind, id): Promise<void>` → `DomainError("in_use", "Está en uso en N elementos")` si `usage>0`. Permisos: `category:*` para categorías y géneros, `tag:*` para etiquetas. `color` valida `#RRGGBB`; `family` ∈ `electronica | indie | otros`.

- [ ] **Step 1: Tests.** crear categoría con slug repetido → `-2`; `color` inválido → ZodError; borrar categoría usada por un artículo → `in_use` con N; borrar género usado por un artista → `in_use`; borrar etiqueta libre OK; redactor puede crear etiqueta pero no borrar (`ForbiddenError`).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Página con tres pestañas (categorías con orden numérico y color; etiquetas; géneros con familia). Aviso: «El orden de las categorías define el ticker de la portada». Nav: Organización→Taxonomía.
- [ ] **Step 6: Verificación.** tsc + eslint; reordenar categorías y ver el ticker.

### Task 8: Suscriptores

**Files:**
- Create: `src/modules/settings/subscribers-admin.ts`, `src/app/(admin)/admin/(panel)/suscriptores/{page.tsx,actions.ts}`, `src/app/(admin)/admin/(panel)/suscriptores/export/route.ts`, `src/lib/csv.ts`
- Modify: `src/ui/admin/nav.ts`
- Test: `tests/admin-subscribers.test.ts`

**Interfaces:**
- Produces (`subscriber:*`): `listSubscribers(db, actor, q: { search?: string; status?: SubscriberState; page?: number }): Promise<{ items: Subscriber[]; total: number; counts: Record<SubscriberState, number> }>`; `setSubscriberStatus(db, actor, id, status: SubscriberState)` (`subscriber:update`; `confirmed` fija `confirmedAt`); `deleteSubscriber(db, actor, id)` (`subscriber:delete`); `csvCell(value: string): string` en `src/lib/csv.ts` (escapa comillas y antepone `'` si empieza por `=`, `+`, `-`, `@`, tab o CR); `exportSubscribersCsv(db, actor, q?): Promise<string>` con columnas `email,estado,origen,consentimiento,confirmado`.

- [ ] **Step 1: Tests.** `csvCell("=HYPERLINK(\"x\")")` empieza por `'`; `csvCell('a"b')` → `"a""b"`; `setSubscriberStatus(...,"confirmed")` fija `confirmedAt`, `"unsubscribed"` no lo borra; exportar respeta el filtro de estado; `deleteSubscriber` elimina; editor puede leer pero no borrar.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Página con conteos por estado, búsqueda, filtro, cambio de estado, borrar con confirmación y botón «Exportar CSV» (route handler `GET` con `Content-Disposition` y permiso `subscriber:read`). Nota visible: «El envío de correos aún no está disponible». Nav: Audiencia→Suscriptores.
- [ ] **Step 6: Verificación.** tsc + eslint; suscribirse desde la portada y verlo aparecer como pendiente.

### Task 9: Ajustes del sitio y páginas fijas

**Files:**
- Create: `src/modules/settings/site.ts`, `src/modules/settings/site-validators.ts`, `src/modules/content/pages-admin.ts`, `src/app/(admin)/admin/(panel)/ajustes/{page.tsx,actions.ts}`, `src/app/(admin)/admin/(panel)/paginas/{page.tsx,nuevo/page.tsx,[id]/page.tsx,actions.ts}`, `src/app/(public)/pagina/[slug]/page.tsx`, `src/ui/admin/PageForm.tsx`
- Modify: `src/ui/Footer.tsx`, `src/ui/NewsletterForm.tsx` o su contenedor en `src/app/(public)/page.tsx`, `src/app/layout.tsx` (metadata por defecto), `src/ui/admin/nav.ts`
- Test: `tests/admin-settings.test.ts`, `tests/admin-pages.test.ts`

**Interfaces:**
- Produces:
  - `type SiteSettings = { site: { name: string; tagline: string; description: string }; social: Partial<Record<"instagram" | "youtube" | "spotify" | "soundcloud" | "x", string>>; newsletter: { title: string; text: string }; footer: { text: string } }`.
  - `getSiteSettings(db: Db): Promise<SiteSettings>` — lectura pública: mezcla `site_settings` con valores por defecto **idénticos al texto fijo actual** (si falta la clave, la web queda igual que hoy).
  - `saveSiteSettings(db, actor, raw: unknown): Promise<void>` (`setting:update`); URLs sociales `httpsUrlSchema`; una escritura por clave con `updatedBy`.
  - Páginas: `listPagesAdmin`, `getPageAdmin`, `createPage`, `updatePage`, `setPageStatus(db, actor, id, "draft" | "published")` (`page:publish`), `deletePage`; el cuerpo se sanea con la misma función que usa `createArticle` en `src/modules/content/admin.ts`. Público: `getPublishedPage(db, slug)` y la ruta `/pagina/[slug]` (404 si no está publicada); `pages` se incluye en el sitemap.

- [ ] **Step 1: Tests.** `getSiteSettings` sin filas devuelve los defaults; tras `saveSiteSettings` refleja el cambio; URL social `http://` o `javascript:` → ZodError; `<script>` en el cuerpo de una página se elimina; página en borrador → `getPublishedPage` devuelve `null`; slug de página repetido → error claro (`DomainError("slug_taken")`); editor puede guardar ajustes pero no un redactor.
- [ ] **Step 2:** FAIL. **Step 3:** implementar servicios. **Step 4:** PASS.
- [ ] **Step 5:** Conectar `getSiteSettings` en Footer (texto y redes), bloque de newsletter y metadata por defecto, **sin alterar marcado ni clases**; si una red no está definida, no se muestra su enlace. Páginas de admin (reutilizando `TiptapEditor` como `ArticleEditor`) y ruta pública. Nav: Contenido→Páginas, Sistema→Ajustes.
- [ ] **Step 6: Verificación.** tsc + eslint + `npx vitest run`; en el navegador: cambiar el texto del pie, ver el cambio en `/`; crear y publicar `/pagina/acerca`. Sin la fila de ajustes la portada se ve idéntica a antes.

### Task 10: Usuarios y auditoría

**Files:**
- Create: `src/modules/users/admin.ts`, `src/modules/users/admin-validators.ts`, `src/app/(admin)/admin/(panel)/usuarios/{page.tsx,nuevo/page.tsx,[id]/page.tsx,actions.ts}`, `src/app/(admin)/admin/(panel)/auditoria/page.tsx`, `src/ui/admin/UserForm.tsx`
- Modify: `src/ui/admin/nav.ts`
- Test: `tests/admin-users.test.ts`

**Interfaces:**
- Consumes: `createUser` (`users/auth.ts`), `canAssignRole`, tabla `sessions`.
- Produces: `listUsers(db, actor)` (`user:read`; nunca devuelve `passwordHash`); `createUserAdmin(db, actor, raw: { email; name; role: Role; password: string /* ≥12 */ }): Promise<{ id: string }>` (`user:create` + `canAssignRole`); `updateUserAdmin(db, actor, id, raw: { name?: string; role?: Role; active?: boolean })`; `resetUserPassword(db, actor, id, password: string)` (borra las sesiones del usuario); `listAudit(db, actor, q: { entity?: string; userId?: string; from?: Date; to?: Date; page?: number }): Promise<{ items: { id; action; entity; entityId; userName: string | null; createdAt: Date; diff: unknown }[]; total: number }>` (`audit:read`). Regla: `DomainError("last_superadmin")` si la operación deja cero superadmins activos; al desactivar a alguien se eliminan sus sesiones; nadie se desactiva ni cambia el rol a sí mismo.

- [ ] **Step 1: Tests.** admin crea `editor` OK y `superadmin` → `ForbiddenError`; superadmin crea admin OK; contraseña de 11 caracteres → ZodError; correo repetido (sin distinguir mayúsculas) → `DomainError`; degradar al único superadmin → `last_superadmin`; con dos superadmins sí se permite; desactivar borra sus `sessions`; `listUsers` no incluye hash; `listAudit` filtra por entidad y por usuario; editor no puede `listAudit`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Páginas de usuarios (lista, crear, editar rol/estado, restablecer contraseña) y auditoría (tabla filtrable, `diff` en `<details>`). Nav: Sistema→Usuarios (`user:read`), Sistema→Auditoría (`audit:read`).
- [ ] **Step 6: Verificación.** tsc + eslint; crear un editor y comprobar que no ve Usuarios en la navegación.

### Task 11: Fuentes de noticias (registro)

**Files:**
- Create: `src/modules/ingest/admin.ts`, `src/modules/ingest/admin-validators.ts`, `src/app/(admin)/admin/(panel)/fuentes/{page.tsx,nuevo/page.tsx,[id]/page.tsx,actions.ts}`, `src/ui/admin/SourceForm.tsx`
- Modify: `src/ui/admin/nav.ts`
- Test: `tests/admin-sources.test.ts`

**Interfaces:**
- Consumes: tabla `sources`, `publicHttpUrlSchema`, `SOURCE_KINDS`, `RIGHTS_POLICIES`, `PUBLISH_POLICIES`.
- Produces (`source:*`): `listSourcesAdmin`, `getSourceAdmin`, `createSource` (siempre `active=false`, `paused=false`), `updateSource`, `setSourceActive(db, actor, id, active: boolean)` (`source:manage`; activar exige `termsVerifiedAt` no nulo y política de derechos definida, si no `DomainError("terms_unverified")`), `markTermsVerified(db, actor, id)`, `deleteSource`. `intervalMinutes` 5–1440; `dailyLimit` 1–200; URL con `isPublicHost` (anti-SSRF).

- [ ] **Step 1: Tests.** URL `http://localhost/feed` y `http://192.168.1.5/x` → ZodError; nace desactivada aunque llegue `active:true`; activar sin términos verificados → `terms_unverified`; tras `markTermsVerified` se puede activar; editor lee pero no activa; borrar audita.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** Páginas (lista con estado, formulario, botón «Marcar términos verificados», aviso «No se ejecuta ninguna ingesta todavía»). Nav: Sistema→Fuentes (`source:read`).
- [ ] **Step 6: Verificación.** tsc + eslint.

### Task 12: Cierre y verificación integral

**Files:**
- Modify: `PROGRESS.md` (sección «Administrador completo», quitar las limitaciones ya resueltas), `README.md` si menciona el alcance del panel
- Test: suite completa

- [ ] **Step 1:** `npx vitest run` → todas las pruebas pasan (las 105 previas + las nuevas); `npx tsc --noEmit` y `npx eslint src tests` sin errores.
- [ ] **Step 2:** Levantar BD temporal (`npx pglite-server --db=<ruta temporal> --port=5544`, `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres`, `npx tsx scripts/db.ts seed`) y crear un superadmin con `npm run admin:create`; recorrer en el navegador cada sección a 1440 px y 375 px: crear, editar, publicar y borrar un elemento de cada tipo y comprobar el efecto en `/`. No tocar `.data/pglite`.
- [ ] **Step 3:** Entrar con un `editor` y un `redactor` y confirmar que la navegación solo muestra lo permitido y que las URLs prohibidas redirigen.
- [ ] **Step 4:** Actualizar `PROGRESS.md` con lo hecho, lo verificado y lo que **no** se verificó; detener servidores temporales.
