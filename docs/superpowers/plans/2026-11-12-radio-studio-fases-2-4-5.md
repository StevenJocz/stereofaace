# Radio Studio — Fases 2, 4 y 5 · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cart Wall con jingles, promos y todo lo que no es música (fase 2), listas guardadas e historial de emisión (fase 4) y pulido con atajos, Wake Lock y guía del DJ (fase 5). La fase 3 (voz, ducking, EQ) tiene su propio plan: `2026-11-12-radio-studio-fase3-voz.md`.

**Architecture:** Servidor: tablas `studio_carts`, `studio_playlists` y `studio_history` (Drizzle, migración 0004), servicios con `assertCan` + Zod + `recordAudit` y rutas `/api/studio/*`. Audio de los carts en el volumen de medios (`MEDIA_ROOT`) bajo claves UUID. Cliente: `AudioEngine` gana un bus de carts con buffers decodificados para disparo instantáneo; paneles nuevos en la consola.

**Tech Stack:** Next.js 16.4, Drizzle + PGlite (pruebas) / pg, Zod 4, Web Audio, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-radio-studio-live-design.md` (fases 2, 4 y 5).

## Global Constraints

- Tipos de cart: `jingle`, `promo`, `sweeper` (cortinilla), `effect` (efecto), `ad` (anuncio), `id` (identificación). Cualquier otra cosa se rechaza.
- Audio de carts: MP3, WAV, OGG, M4A/AAC y FLAC; máximo 25 MB; se valida por contenido (firmas ID3/MPEG, RIFF…WAVE, OggS, fLaC, `ftyp`), no por el MIME declarado.
- Claves de almacenamiento: UUID (mismo contrato que `storeImageAtomically`); escritura atómica; nunca se usa un nombre de archivo del usuario como ruta.
- Permisos: usar carts, listas e historial = `station:update`; crear/editar/borrar carts = `station:update`; borrado de un cart o lista = `station:delete`. El servidor decide.
- Borrados lógicos para carts (`deleted_at`), como el resto del proyecto; las listas son del DJ que las creó (o `station:manage`).
- Ducking por cart: cada cart tiene `duck` (boolean) y `gainDb` (−24…+6); el motor baja la música con el `DuckController` mientras suene un cart con `duck`.
- Wake Lock solo mientras se está EN VIVO.
- Sin `any`; `tsc`, `eslint` y `vitest` en verde antes de cada commit. Textos en español.

## Review Focus

- Subir un archivo que no es audio (PNG renombrado a `.mp3`): se rechaza por su contenido. (Task 2)
- Un cart borrado deja de aparecer y su audio no se sirve; pedir un id inexistente o mal formado responde 404/400. (Task 2)
- Disparar el mismo cart dos veces seguidas: el segundo toque reinicia el cart (no se apilan copias). (Task 4)
- Listas guardadas con pistas de AzuraCast que ya no existen: se cargan las que existen y se avisa de las perdidas. (Task 6)
- Un DJ no puede leer ni borrar las listas de otro DJ (salvo `station:manage`). (Task 6)
- El historial no se llena con la misma pista si se pausa y se reanuda: una entrada por inicio de pista en el aire. (Task 7)

---

## File Structure

- `src/modules/studio/schema.ts` — tablas `studio_carts`, `studio_playlists`, `studio_history`; `drizzle/0004_studio.sql` + `drizzle/meta`.
- `src/modules/studio/audio-validation.ts` — `validateAudioUpload`.
- `src/modules/studio/carts.ts` — servicio de carts; `src/modules/studio/cart-http.ts` — manejadores HTTP.
- `src/modules/studio/playlists.ts`, `src/modules/studio/history.ts` — servicios.
- `src/app/api/studio/{carts,cart/[id],saved-playlists,history}/route.ts` — rutas finas.
- `src/app/(admin)/admin/(panel)/radio/studio/carts/page.tsx` — administración de carts.
- `src/ui/studio/CartWall.tsx`, `CartManager.tsx`, `SavedLists.tsx`, `HistoryList.tsx`, `ShortcutsHelp.tsx`.
- `src/ui/studio/engine/carts.ts` — lógica pura de atajos y selección.
- Pruebas: `tests/studio-audio-validation.test.ts`, `tests/studio-carts.test.ts`, `tests/studio-cart-engine.test.ts`, `tests/studio-playlists.test.ts`, `tests/studio-history.test.ts`.

---

### Task 1: Esquema y migración 0004

**Files:** Create `src/modules/studio/schema.ts`, `drizzle/0004_studio.sql`; Modify `src/db/schema.ts` (exportar), `drizzle/meta/_journal.json`, `drizzle/meta/0004_snapshot.json`.

**Interfaces — Produces:**
- `studioCarts`: `id uuid pk`, `name text`, `kind text`, `color text` (`#rrggbb`), `hotkey text null` (1 carácter), `storageKey text` (uuid), `mime text`, `bytes int`, `durationSec real null`, `gainDb real default 0`, `duck boolean default true`, `position int`, `createdBy uuid null`, `createdAt`, `updatedAt`, `deletedAt null`.
- `studioPlaylists`: `id uuid pk`, `ownerId uuid`, `name text`, `items jsonb` (`{ azId: string; title: string; artist: string; durationSec: number | null }[]`), `createdAt`, `updatedAt`.
- `studioHistory`: `id uuid pk`, `playedAt timestamptz`, `title text`, `artist text`, `source text`, `djName text null`, `userId uuid null`.

- [ ] **Step 1:** Escribir las tablas siguiendo el estilo de `src/modules/radio/schema.ts` (helpers `pk()`, `timestamps`); `npx drizzle-kit generate` (con `ESBUILD_BINARY_PATH` si hace falta en Windows) para obtener la migración; revisar que el SQL solo cree las tres tablas.
- [ ] **Step 2:** `npx vitest run tests/` — las pruebas existentes (que migran PGlite) siguen verdes, lo que prueba que la migración aplica.
- [ ] **Step 3: Commit** `feat(studio): tablas de carts, listas guardadas e historial`.

### Task 2: Validación y almacenamiento de audio de carts

**Files:** Create `src/modules/studio/audio-validation.ts`, `src/modules/studio/carts.ts`; Test `tests/studio-audio-validation.test.ts`, `tests/studio-carts.test.ts`.

**Interfaces — Produces:**
- `validateAudioUpload(file: File): Promise<{ ok: true; mime: string; extension: string; bytes: Uint8Array } | { ok: false; message: string }>` (máx. 25 MB; firmas por contenido).
- `CART_KINDS` (`as const`), `type CartKind`.
- `type CartView = { id: string; name: string; kind: CartKind; color: string; hotkey: string | null; durationSec: number | null; gainDb: number; duck: boolean; position: number }`.
- `listCarts(db, actor): Promise<CartView[]>` (sin borrados, por `position`), `createCart(db, actor, root: string, input: { name: string; kind: CartKind; color?: string; hotkey?: string; gainDb?: number; duck?: boolean; durationSec?: number }, file: File): Promise<CartView>`, `updateCart(db, actor, id, patch)`, `deleteCart(db, actor, id)` (lógico), `readCartAudio(db, actor, root, id): Promise<{ bytes: Buffer; mime: string } | null>`, `moveCart(db, actor, id, direction: "up" | "down")`.

- [ ] **Step 1: Pruebas que fallan** — validación: un MP3 con cabecera `ID3` y uno con sincronía MPEG (`0xFFFB`) pasan; un WAV (`RIFF....WAVE`) pasa; un PNG renombrado `.mp3` se rechaza; un archivo de 26 MB se rechaza; uno vacío se rechaza. Servicio (con `makeDb()` y un directorio temporal): crear un cart guarda el archivo bajo una clave UUID y devuelve la vista; rechaza `kind: "otro"` (Zod) y un hotkey de 2 caracteres; `hotkey` duplicado entre carts activos se rechaza con `DomainError`; un redactor no puede crear (403); `deleteCart` lo oculta de `listCarts` y `readCartAudio` devuelve `null`; id mal formado → `null`; `moveCart` intercambia posiciones.
- [ ] **Step 2:** `npx vitest run tests/studio-audio-validation.test.ts tests/studio-carts.test.ts` — falla.
- [ ] **Step 3:** Implementar. Escritura atómica como `storeImageAtomically` (archivo temporal + `rename`), clave `randomUUID()`.
- [ ] **Step 4:** Pasan.
- [ ] **Step 5: Commit** `feat(studio): servicio de carts con validación de audio por contenido`.

### Task 3: Rutas HTTP de carts y administración

**Files:** Create `src/modules/studio/cart-http.ts`, `src/app/api/studio/carts/route.ts`, `src/app/api/studio/cart/[id]/route.ts`, `src/app/(admin)/admin/(panel)/radio/studio/carts/page.tsx`, `src/app/(admin)/admin/(panel)/radio/studio/carts/actions.ts`, `src/ui/studio/CartManager.tsx`; Test `tests/studio-cart-http.test.ts`.

**Interfaces — Produces:** `GET /api/studio/carts` → `CartView[]`; `GET /api/studio/cart/<id>` → audio (con `Range`, `cache-control: private`); acciones de servidor `uploadCartAction`, `updateCartAction`, `deleteCartAction`, `moveCartAction` (formularios con `guard`); manejadores `cartsListHandler(db, actor)`, `cartAudioHandler(db, actor, root, id, range)` (401/403/404/400).

- [ ] **Step 1: Pruebas** — sin sesión 401; redactor 403; id inexistente 404; id malformado 400; con `Range: bytes=0-9` responde 206 y `content-range`; el cuerpo coincide con lo guardado.
- [ ] **Step 2:** Falla. **Step 3:** Implementar rutas finas y la página de administración (subir con nombre, tipo, color, atajo, ganancia y «bajar música»; lista con renombrar, reordenar, borrar con confirmación; duración leída en el navegador al elegir el archivo y enviada en el formulario). **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(studio): rutas y administración de carts`.

### Task 4: Motor y Cart Wall en la consola

**Files:** Create `src/ui/studio/engine/carts.ts`, `src/ui/studio/CartWall.tsx`; Modify `src/ui/studio/engine/audio-engine.ts`, `src/ui/studio/StudioConsole.tsx`, `src/app/globals.css`; Test `tests/studio-cart-engine.test.ts`.

**Interfaces:**
- Pure (`engine/carts.ts`): `groupByKind(carts: CartView[]): Record<CartKind, CartView[]>`; `hotkeyMap(carts: CartView[]): Map<string, string>` (tecla en minúscula → id; ignora duplicados, conserva el primero); `isTypingTarget(el: { tagName: string; isContentEditable?: boolean } | null): boolean`.
- `AudioEngine` nuevos: `preloadCart(id: string, url: string): Promise<void>` (descarga y `decodeAudioData`), `playCart(id: string, opts: { gainDb: number; duck: boolean }): void` (reinicia el cart si ya suena; ruta `buffer → cartGain → bus`), `stopCart(id: string)`, `stopAllCarts()`, `onCartEnded: ((id: string) => void) | null`, `isCartPlaying(id): boolean`. Mientras suene un cart con `duck`, se fuerza el ducking de la música (mismo `DuckController` de la fase 3: `setDuckForced`).

- [ ] **Step 1: Pruebas** — `groupByKind` agrupa y ordena por `position`; `hotkeyMap` ignora teclas duplicadas y mayúsculas; `isTypingTarget({tagName:"INPUT"})` true, `{tagName:"DIV"}` false.
- [ ] **Step 2:** Falla. **Step 3:** Implementar lo puro y el motor (`AudioBufferSourceNode`; un nodo por cart en reproducción). **Step 4:** Pasa.
- [ ] **Step 5:** `CartWall`: pestañas por tipo, botones grandes con color, nombre, atajo y duración, indicador de «sonando» con cuenta atrás, botón «Detener todos»; precarga de los buffers al abrir; los atajos se ignoran si el foco está en un campo de texto; si no hay carts, enlace a la administración. Conectar en `StudioConsole`.
- [ ] **Step 6:** Verificación en navegador: subir dos carts de prueba (tonos de 800 Hz y 1200 Hz) desde la administración, dispararlos en la consola con una canción sonando: se oyen encima, la música baja con `duck`, un segundo toque reinicia el cart, «Detener todos» corta, y por EN VIVO real el tono del cart llega a la señal pública.
- [ ] **Step 7: Commit** `feat(studio): Cart Wall con disparo instantáneo y ducking`.

### Task 5: Listas guardadas

**Files:** Create `src/modules/studio/playlists.ts`, `src/modules/studio/playlist-http.ts`, `src/app/api/studio/saved-playlists/route.ts`, `src/ui/studio/SavedLists.tsx`; Test `tests/studio-playlists.test.ts`.

**Interfaces — Produces:** `type SavedItem = { azId: string; title: string; artist: string; durationSec: number | null }`; `listSaved(db, actor): Promise<{ id: string; name: string; count: number; mine: boolean }[]>`, `getSaved(db, actor, id): Promise<{ id: string; name: string; items: SavedItem[] }>`, `saveList(db, actor, input: { name: string; items: SavedItem[]; id?: string }): Promise<{ id: string }>`, `deleteSaved(db, actor, id)`. Rutas: `GET/POST/DELETE /api/studio/saved-playlists` (`?id=`).

- [ ] **Step 1: Pruebas** — guardar y leer; solo se guardan ítems con `azId` numérico (el resto se descarta y se informa el recuento); máx. 500 ítems y nombre 1–80 caracteres; un DJ no ve ni borra las listas de otro (`ForbiddenError`/lista vacía) pero `admin` sí; guardar con el mismo `id` actualiza; una lista vacía se rechaza.
- [ ] **Step 2:** Falla. **Step 3:** Implementar. **Step 4:** Pasa.
- [ ] **Step 5:** `SavedLists` en la consola: «Guardar cola como lista» (solo ítems de AzuraCast; los locales se omiten con aviso), listar, cargar a la cola (las pistas que ya no existen en AzuraCast se omiten y se informa, comprobando con `/api/studio/library`), borrar.
- [ ] **Step 6: Commit** `feat(studio): listas guardadas`.

### Task 6: Historial de emisión

**Files:** Create `src/modules/studio/history.ts`, `src/app/api/studio/history/route.ts`, `src/ui/studio/HistoryList.tsx`, `src/app/(admin)/admin/(panel)/radio/studio/historial/page.tsx`; Test `tests/studio-history.test.ts`.

**Interfaces — Produces:** `logPlayed(db, actor, entry: { title: string; artist: string; source: "local" | "azuracast" | "cart"; djName?: string }): Promise<void>` (ignora una entrada idéntica a la anterior en menos de 30 s); `listHistory(db, actor, opts?: { limit?: number; before?: Date }): Promise<{ id: string; playedAt: string; title: string; artist: string; source: string; djName: string | null }[]>`; `POST /api/studio/history` (cuerpo JSON validado con Zod), `GET /api/studio/history?limit=`.

- [ ] **Step 1: Pruebas** — registra y lista en orden descendente; la misma pista en < 30 s no duplica y en > 30 s sí; título vacío o de 300 caracteres se rechaza/recorta a 200; sin permiso 403; límite por defecto 50 y máximo 200.
- [ ] **Step 2:** Falla. **Step 3:** Implementar. **Step 4:** Pasa.
- [ ] **Step 5:** La consola llama a `POST /api/studio/history` cuando una pista pasa a estar activa mientras el estado es `live` (una vez por inicio de pista: se guarda el id de la última pista registrada). Panel «Últimas emitidas» y página `/admin/radio/studio/historial` con exportación CSV (`src/lib/csv.ts` existente).
- [ ] **Step 6: Commit** `feat(studio): historial de emisión`.

### Task 7: Pulido (fase 5) y menores diferidos

**Files:** Create `src/ui/studio/ShortcutsHelp.tsx`, `docs/guia-dj-estudio.md`; Modify `StudioConsole.tsx`, `LiveBar.tsx`, `QueuePanel.tsx`, `engine/webcast.ts`, `src/modules/studio/azuracast.ts`, `http.ts`, `globals.css`; Test: ampliar `tests/studio-webcast.test.ts` y `tests/studio-http.test.ts`.

- [ ] **Step 1: Pruebas que fallan** — (a) `metadataMessage` con 199 caracteres + un emoji de dos unidades en la frontera conserva JSON válido y no deja sustitutos sueltos (recorte por caracteres, no por unidades UTF-16); (b) tras 8 reintentos fallidos sin haber llegado nunca a `live`, `WebcastSender` pasa a `error` y deja de reintentar; (c) `fileHandler` pasa un 416 de AzuraCast como 416 (no 502).
- [ ] **Step 2:** Falla. **Step 3:** Implementar (a)–(c).
- [ ] **Step 4:** Interfaz y navegador: bloquear `dragover`/`drop` fuera de la cola para que soltar un archivo no abra la página; deshabilitar «Cargar en A/B» para el deck que está al aire; comprobar `MediaRecorder.isTypeSupported(WEBCAST_MIME)` antes de conectar con un mensaje claro; **Wake Lock** (`navigator.wakeLock.request("screen")`) mientras `live` y liberarlo al terminar (con comprobación de soporte); panel de atajos (`?`), medidores en un componente aparte para no re-renderizar toda la consola cada 80 ms; ajustes de diseño responsive (columna única bajo 1024 px).
- [ ] **Step 5:** `docs/guia-dj-estudio.md`: cómo entrar, conectar, cargar música y carts, hablar con el micrófono, qué hacer si se corta, atajos y límites conocidos (pestaña abierta, retraso del oyente 16–18 s).
- [ ] **Step 6: Commit** `feat(studio): pulido, Wake Lock, atajos y guía del DJ`.

### Task 8: Extremo a extremo, revisión y despliegue

- [ ] **Step 1:** `npx tsc --noEmit && npx eslint src tests && npx vitest run` en verde.
- [ ] **Step 2:** Prueba EN VIVO real con `dj1` desde el navegador local: música + micrófono simulado + cart; medir la señal pública (pico de la música, voz presente, cart presente, ducking ≈ −12 dB) como en la fase 1.
- [ ] **Step 3:** Revisión final independiente de toda la rama; corregir Critical e Important con pruebas que fallen primero.
- [ ] **Step 4:** Actualizar `PROGRESS.md`; fusionar a `main`; `git push`; esperar el despliegue automático; comprobar `https://stereoface.online/admin/radio/studio` (la verificación con la clave real de AzuraCast y el micrófono físico la hace el dueño y se documenta como pendiente).

---

## Self-Review

- **Cobertura de las fases:** Cart Wall con jingles, promos, cortinillas, efectos, anuncios e identificaciones → Tasks 1–4; listas guardadas → 5; historial → 6; pulido, Wake Lock, atajos, guía y menores diferidos → 7; verificación y despliegue → 8.
- **Dependencias entre planes:** el ducking forzado de los carts (Task 4) usa `setDuckForced`/`DuckController` de la fase 3, así que la fase 3 se ejecuta primero.
- **Consistencia de tipos:** `CartView`, `CartKind`, `SavedItem` y las firmas de `AudioEngine` se definen una vez y se consumen igual.
