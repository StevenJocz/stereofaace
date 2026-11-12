# Radio Studio — Fase 1: núcleo de emisión · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una consola web en `/admin/radio/studio` con dos decks, cola con arrastrar y soltar, crossfade, master con limitador y medidores, emisión EN VIVO a AzuraCast con metadatos y reconexión, y la biblioteca de AzuraCast (carpetas y listas) como fuente de música.

**Architecture:** Lógica pura (cola, crossfade, medidores, protocolo webcast, reconexión) en `src/ui/studio/engine/*.ts`, sin DOM y probada con vitest en Node. Un motor de audio solo-navegador (`audio-engine.ts`) arma el grafo Web Audio y lo conecta a la lógica pura. La interfaz son componentes cliente bajo `src/ui/studio/`. La página es dinámica y protegida por el RBAC existente.

**Tech Stack:** Next.js 16.4 (Cache Components), React 19, TypeScript, Tailwind 4, Web Audio API, `MediaRecorder`, WebSocket, `@dnd-kit/core` + `@dnd-kit/sortable` (MIT), vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-radio-studio-live-design.md`

## Global Constraints

- Transporte: `wss://radio.stereoface.online/webdj/stereo_face/`, subprotocolo `webcast`; primer mensaje `{"type":"hello","data":{"mime","user","password"}}`; después binarios de `MediaRecorder`; metadatos `{"type":"metadata","data":{"title","artist"}}`.
- Formato: `audio/webm;codecs=opus`, `audioBitsPerSecond: 128000`, `MediaRecorder.start(1000)`.
- Credenciales del DJ solo en `sessionStorage`; nunca en servidor ni en el código.
- Acceso: `requirePermission("station:update")` en la página; el cliente oculta, el servidor decide.
- El master nunca supera 0 dBFS (limitador `DynamicsCompressorNode` con `threshold -3`, `ratio 20`, `attack 0.003`).
- Cronometraje de crossfade con `AudioContext.currentTime`, no con `setTimeout`.
- Next.js 16 con Cache Components: la página usa `await connection()` bajo `<Suspense>` como el resto del admin. Leer `node_modules/next/dist/docs/` si se duda de una API.
- Código y textos de interfaz en español; sin `any`; `tsc`, `eslint` y `vitest` deben pasar antes de cada commit.

## Review Focus

- Un archivo que no es audio (imagen, PDF) arrastrado a la cola: se rechaza con aviso y no entra. (Task 1)
- El mismo archivo añadido dos veces: entra dos veces con ids distintos, sin pisarse. (Task 1)
- Doble clic en EN VIVO: una sola conexión, nunca dos sockets. (Task 4)
- Contraseña de DJ incorrecta: la consola muestra «Usuario o contraseña incorrectos» y vuelve a desconectada, sin quedarse «conectando». (Task 4)
- Pista sin duración legible (`NaN`/`Infinity`): el crossfade no se dispara y se avisa; la cola no se atasca. (Task 2)
- `AudioContext` suspendido hasta un gesto del usuario: EN VIVO lo reanuda y, si no puede, avisa. (Task 5)
- Título larguísimo o con caracteres no latinos en metadatos: se recorta a 200 caracteres sin romper el JSON. (Task 4)

---

## File Structure

- `src/ui/studio/engine/queue.ts` — reducer puro de la cola (`QueueItem`, `queueReducer`).
- `src/ui/studio/engine/audio-files.ts` — validación de archivos de audio y título/artista desde el nombre.
- `src/ui/studio/engine/crossfade.ts` — plan de crossfade y curvas de ganancia.
- `src/ui/studio/engine/meter.ts` — conversión a dB y retención de picos.
- `src/ui/studio/engine/webcast.ts` — mensajes del protocolo, `WebcastSender` y política de reconexión.
- `src/ui/studio/engine/audio-engine.ts` — grafo Web Audio (solo navegador; sin prueba unitaria).
- `src/ui/studio/StudioConsole.tsx` — contenedor cliente que enlaza motor, cola y emisión.
- `src/ui/studio/{LiveBar,DeckPanel,QueuePanel,MeterBar}.tsx` — paneles.
- `src/app/(admin)/admin/(panel)/radio/studio/page.tsx` — ruta protegida.
- `src/ui/admin/nav.ts` — enlace «Estudio».
- Pruebas: `tests/studio-queue.test.ts`, `tests/studio-audio-files.test.ts`, `tests/studio-crossfade.test.ts`, `tests/studio-meter.test.ts`, `tests/studio-webcast.test.ts`.

---

### Task 1: Cola de reproducción y validación de archivos

**Files:**
- Create: `src/ui/studio/engine/queue.ts`, `src/ui/studio/engine/audio-files.ts`
- Test: `tests/studio-queue.test.ts`, `tests/studio-audio-files.test.ts`
- Modify: `package.json` (añadir `@dnd-kit/core` y `@dnd-kit/sortable`)

**Interfaces:**
- Produces:
  - `type QueueItem = { id: string; file: File | null; title: string; artist: string; durationSec: number | null; source: "local" | "cart" }`
  - `type QueueAction = { type: "add"; items: QueueItem[] } | { type: "remove"; id: string } | { type: "move"; from: number; to: number } | { type: "shift" } | { type: "clear" }`
  - `queueReducer(state: QueueItem[], action: QueueAction): QueueItem[]` (`shift` quita el primero)
  - `isAudioFile(file: { name: string; type: string }): boolean` (MP3, WAV, OGG, M4A/AAC, FLAC, por tipo MIME o extensión)
  - `parseTrackName(fileName: string): { artist: string; title: string }` («Artista - Título.mp3» → artista y título; sin guion: artista `""`)
  - `makeItems(files: File[]): { items: QueueItem[]; rejected: string[] }` (ids únicos con `crypto.randomUUID()`)

- [ ] **Step 1: Escribir las pruebas que fallan** — `queueReducer`: `add` agrega al final en orden; `move` 0→2 reordena; `remove` de un id inexistente no cambia nada; `shift` sobre cola vacía devuelve `[]`; añadir el mismo `File` dos veces produce ids distintos. `isAudioFile`: `{name:"a.mp3",type:"audio/mpeg"}` true; `{name:"a.flac",type:""}` true; `{name:"foto.png",type:"image/png"}` false; `{name:"doc.pdf",type:"application/pdf"}` false. `parseTrackName("Of Monsters and Men - Little Talks.mp3")` → `{artist:"Of Monsters and Men",title:"Little Talks"}`; `parseTrackName("01 intro.wav")` → `{artist:"",title:"01 intro"}`. `makeItems([png, mp3])` → un item y `rejected: ["foto.png"]`.
- [ ] **Step 2:** Ejecutar `npx vitest run tests/studio-queue.test.ts tests/studio-audio-files.test.ts` — falla por módulos inexistentes.
- [ ] **Step 3:** Implementar las funciones con las firmas de arriba. `npm install @dnd-kit/core @dnd-kit/sortable` (comprobar licencia MIT y versión en `package.json`).
- [ ] **Step 4:** Mismo comando — pasa.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat(studio): cola de reproducción y validación de audio"`.

### Task 2: Plan de crossfade

**Files:**
- Create: `src/ui/studio/engine/crossfade.ts`
- Test: `tests/studio-crossfade.test.ts`

**Interfaces:**
- Produces:
  - `planCrossfade(input: { durationSec: number; fadeSec: number; minTrackSec?: number }): { startAtSec: number; fadeSec: number } | null` — `startAtSec = durationSec - fadeSec`; devuelve `null` si `durationSec` no es finito, es menor que `minTrackSec` (por defecto `fadeSec * 2`), o `fadeSec <= 0`.
  - `equalPowerGains(progress: number): { out: number; in: number }` con `progress` en `[0,1]` (se acota): `out = cos(p·π/2)`, `in = sin(p·π/2)`.

- [ ] **Step 1:** Pruebas: `planCrossfade({durationSec:200,fadeSec:6})` → `{startAtSec:194,fadeSec:6}`; `durationSec: NaN`, `Infinity`, `5` con `fadeSec 6`, y `fadeSec 0` → `null`. `equalPowerGains(0)` ≈ `{out:1,in:0}`; `(1)` ≈ `{out:0,in:1}`; `(0.5)` → `out² + in² ≈ 1`; valores fuera de rango (`-1`, `2`) se acotan.
- [ ] **Step 2:** `npx vitest run tests/studio-crossfade.test.ts` — falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(studio): plan de crossfade con curva de potencia constante`.

### Task 3: Medidores

**Files:**
- Create: `src/ui/studio/engine/meter.ts`
- Test: `tests/studio-meter.test.ts`

**Interfaces:**
- Produces:
  - `rmsToDb(samples: Float32Array): number` (−100 como piso; silencio → −100)
  - `peakToDb(samples: Float32Array): number`
  - `class PeakHold { constructor(holdMs: number, decayDbPerSec: number); update(db: number, nowMs: number): number }` — mantiene el pico `holdMs` y luego cae a `decayDbPerSec`.

- [ ] **Step 1:** Pruebas: seno de amplitud 1 → pico ≈ 0 dB y RMS ≈ −3.01 dB; amplitud 0.5 → pico ≈ −6.02 dB; silencio → −100; `PeakHold(1000, 20)`: tras `update(-6,0)` y `update(-40,500)` devuelve −6; en `t=2000` devuelve ≈ −26.
- [ ] **Step 2:** Falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(studio): medidores de nivel`.

### Task 4: Protocolo webcast, emisor y reconexión

**Files:**
- Create: `src/ui/studio/engine/webcast.ts`
- Test: `tests/studio-webcast.test.ts`

**Interfaces:**
- Produces:
  - `WEBCAST_URL = "wss://radio.stereoface.online/webdj/stereo_face/"`, `WEBCAST_MIME = "audio/webm;codecs=opus"`
  - `helloMessage(creds: { user: string; password: string }, mime: string): string` (JSON)
  - `metadataMessage(m: { title: string; artist: string }): string` (JSON; cada campo se recorta a 200 caracteres)
  - `nextBackoffMs(attempt: number): number` — 1000, 2000, 4000, 8000, tope 15000.
  - `type LiveState = "offline" | "connecting" | "live" | "reconnecting" | "auth-error" | "error"`
  - `class WebcastSender` con constructor `{ url, creds, mime, stream: MediaStream, createSocket: (url: string, protocol: string) => SocketLike, createRecorder: (s: MediaStream, o: { mimeType: string; audioBitsPerSecond: number }) => RecorderLike, onState: (s: LiveState) => void }` y métodos `start(): void`, `stop(): void`, `setMetadata(m): void`. `SocketLike`/`RecorderLike` son interfaces mínimas (`send`, `close`, `onopen`, `onclose`, `onerror`, `onmessage`; `start`, `stop`, `ondataavailable`, `state`).

Comportamiento: `start()` es idempotente (segunda llamada con estado ≠ `offline` no abre otro socket); al abrir envía `hello`, arranca el grabador con `start(1000)` y reenvía el último metadato; cierre inesperado → `reconnecting` con `nextBackoffMs`; un cierre antes de recibir datos aceptados con código de autenticación o dentro de 2 s del `hello` sin ningún `onopen` previo exitoso cuenta como `auth-error` y no reintenta; `stop()` cierra sin reintentar y deja `offline`.

- [ ] **Step 1:** Pruebas con sockets y grabador falsos: (a) `helloMessage` produce `{"type":"hello","data":{"mime":"audio/webm;codecs=opus","user":"dj1","password":"x"}}`; (b) `metadataMessage` con título de 500 caracteres queda en 200 y con «Señal ñandú — 日本語» es JSON válido; (c) `nextBackoffMs(0..6)` = 1000,2000,4000,8000,15000,15000,15000; (d) dos `start()` seguidos crean un solo socket; (e) al abrir el socket se envía `hello` y se arranca el grabador con intervalo 1000; (f) cierre inesperado con el temporizador falso avanza `reconnecting` y crea un socket nuevo tras 1000 ms; (g) cierre con mensaje de rechazo antes de cualquier dato deja `auth-error` y no reintenta; (h) `stop()` no reintenta y deja `offline`; (i) los binarios del grabador se envían al socket solo mientras está abierto.
- [ ] **Step 2:** `npx vitest run tests/studio-webcast.test.ts` — falla.
- [ ] **Step 3:** Implementar (sin globales del navegador; todo por inyección).
- [ ] **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(studio): protocolo webcast con reconexión`.

### Task 5: Motor de audio (navegador)

**Files:**
- Create: `src/ui/studio/engine/audio-engine.ts`

**Interfaces:**
- Consumes: `planCrossfade`, `equalPowerGains` (Task 2), `rmsToDb`/`peakToDb` (Task 3).
- Produces: `class AudioEngine` con
  - `constructor()` (crea `AudioContext({ sampleRate: 48000 })`, aún suspendido)
  - `resume(): Promise<void>`
  - `loadDeck(deck: "A" | "B", item: QueueItem): Promise<{ durationSec: number | null }>` (crea `HTMLAudioElement` con `URL.createObjectURL(file)` + `MediaElementAudioSourceNode`; revoca la URL anterior)
  - `play(deck)`, `pause(deck)`, `stopDeck(deck)`, `seek(deck, sec)`, `setDeckVolume(deck, 0..1)`, `setMasterVolume(0..1)`
  - `crossfadeTo(deck: "A" | "B", fadeSec: number): void` (rampa de ganancias con `linearRampToValueAtTime`/curva de `equalPowerGains` sobre `ctx.currentTime`)
  - `getLevels(): { master: { rmsDb: number; peakDb: number }; A: number; B: number }`
  - `get stream(): MediaStream` (de `MediaStreamAudioDestinationNode`, 2 canales)
  - `onDeckEnded: (deck) => void`, `onDeckTime: (deck, current: number, duration: number) => void`
  - `dispose(): void`
  - Grafo: `deck source → deckGain → mixBus → limiter (DynamicsCompressorNode: threshold -3, ratio 20, attack 0.003) → masterGain → analyser + destination`. Sin retorno al altavoz salvo la pre-escucha (fuera de esta fase).

- [ ] **Step 1:** Implementar el motor según las firmas. Un `requestAnimationFrame` de lectura de analizadores solo corre mientras haya suscriptores de niveles.
- [ ] **Step 2:** `npx tsc --noEmit` y `npx eslint src` sin errores.
- [ ] **Step 3:** Verificación en navegador (sin interfaz aún): en la consola del navegador de una página del proyecto, instanciar el motor, cargar un MP3 sintético, `play("A")`, y comprobar que `getLevels().master.peakDb` está entre −60 y 0 y que `onDeckTime` avanza. Anotar el resultado en el mensaje del commit.
- [ ] **Step 4: Commit** `feat(studio): motor de audio con decks, limitador y destino de emisión`.

### Task 6: Consola (interfaz)

**Files:**
- Create: `src/ui/studio/StudioConsole.tsx`, `LiveBar.tsx`, `DeckPanel.tsx`, `QueuePanel.tsx`, `MeterBar.tsx`
- Modify: `src/app/globals.css` (bloque `.studio-*`)

**Interfaces:**
- Consumes: `queueReducer`, `makeItems` (Task 1), `AudioEngine` (Task 5), `WebcastSender`, `WEBCAST_URL`, `WEBCAST_MIME`, `LiveState`, `metadataMessage` (Task 4).
- Produces: `<StudioConsole />` sin props (cliente, `"use client"`).

Contenido y comportamiento:
- `LiveBar`: usuario/contraseña (leídos de y guardados en `sessionStorage`, clave `sf-studio-dj`), botón **EN VIVO**/**Terminar**, estado con texto y color (`offline`, `connecting`, `live`, `reconnecting`, `auth-error` → «Usuario o contraseña incorrectos», `error`), cronómetro al aire.
- `DeckPanel` ×2 (A y B): título, artista, tiempo transcurrido y restante, barra de progreso con `seek`, play/pausa, volumen, medidor.
- `QueuePanel`: zona para soltar archivos (y botón «Añadir archivos»), lista ordenable con `@dnd-kit/sortable`, botones quitar y «Cargar en deck», aviso de archivos rechazados.
- Reglas: al terminar el deck activo, si hay cola y el modo automático está activo, se carga y arranca el siguiente en el otro deck con crossfade de 6 s (`planCrossfade`); el metadato publicado es el de la pista del deck que quedó dominante.
- Aviso `beforeunload` solo mientras `live`/`reconnecting`.
- Todo control tiene `aria-label` y es operable con teclado; espacio = play/pausa del deck seleccionado.

- [ ] **Step 1:** Implementar los componentes y los estilos (oscuro, coherente con el admin: variables CSS existentes).
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint src tests` sin errores.
- [ ] **Step 3: Commit** `feat(studio): consola con decks, cola y barra de emisión`.

### Task 7: Ruta, permisos y navegación

**Files:**
- Create: `src/app/(admin)/admin/(panel)/radio/studio/page.tsx`
- Modify: `src/ui/admin/nav.ts` (añadir `{ href: "/admin/radio/studio", label: "Estudio", permission: "station:update" }` tras «Radio»)

**Interfaces:**
- Consumes: `StudioConsole` (Task 6).

- [ ] **Step 1:** Página servidor: `await requirePermission("station:update")` dentro de un componente bajo `<Suspense>` (`await connection()` si hace falta), `PageHead` con eyebrow «StereoFace Radio» y título «Estudio en vivo», y `<StudioConsole />`.
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint src tests && npx vitest run` — todo pasa (incluidas las pruebas anteriores).
- [ ] **Step 3: Commit** `feat(studio): ruta /admin/radio/studio con permiso station:update`.

### Task 8: Verificación de extremo a extremo y despliegue

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1:** Con el servidor de desarrollo local, abrir `/admin/radio/studio` en el navegador integrado y entrar como administrador. Cargar dos MP3 de prueba (generar tonos distintos con Web Audio guardados como WAV si no hay música a mano). Verificar: ambos decks cargan y reproducen; los medidores se mueven; el crossfade automático pasa de A a B sin silencio; el limitador mantiene el pico ≤ 0 dB.
- [ ] **Step 2:** Pulsar EN VIVO con `dj1`. Comprobar con `curl https://radio.stereoface.online/api/nowplaying/stereo_face` que `live.is_live` es `true`, `streamer_name` es «DJ 1» y el título coincide; medir la señal pública con un `AnalyserNode` en una pestaña de `stereoface.online` (el pico de frecuencia coincide con el tono del deck activo).
- [ ] **Step 3:** Contraseña errónea: la consola muestra «Usuario o contraseña incorrectos» y queda desconectada. Terminar: en menos de 15 s `is_live` vuelve a `false`.
- [ ] **Step 4:** Actualizar `PROGRESS.md` (qué funciona, qué no se probó: micrófono real y sesiones largas) y `git push`; esperar al despliegue automático (flujo de GitHub) y repetir los pasos 2 y 3 en `https://stereoface.online/admin/radio/studio`.
- [ ] **Step 5: Commit** `docs: estado del estudio en vivo (fase 1)`.

### Task 9: Cliente de la API de AzuraCast y ajuste de la clave

**Files:**
- Create: `src/modules/studio/azuracast.ts`, `src/modules/studio/settings.ts`, `src/app/(admin)/admin/(panel)/radio/studio/ajustes/page.tsx`, `src/app/(admin)/admin/(panel)/radio/studio/ajustes/actions.ts`
- Test: `tests/studio-azuracast.test.ts`

**Interfaces:**
- Produces:
  - `getStudioConfig(db, user): Promise<{ baseUrl: string; stationId: string; hasKey: boolean }>` (nunca devuelve la clave)
  - `saveStudioConfig(db, user, input: { baseUrl: string; stationId: string; apiKey?: string }): Promise<void>` — `assertCan(user.role, "station:manage")`, Zod (`baseUrl` https, `stationId` slug); un `apiKey` vacío conserva la guardada; auditoría con `recordAudit` sin la clave.
  - `type AzFile = { id: string; path: string; title: string; artist: string; durationSec: number | null }`, `type AzFolder = { path: string; name: string }`, `type AzPlaylist = { id: number; name: string; trackCount: number }`
  - `class AzuraClient { constructor(cfg: { baseUrl: string; stationId: string; apiKey: string }, fetchImpl?: typeof fetch); listFolders(parent: string): Promise<{ folders: AzFolder[]; files: AzFile[] }>; searchFiles(q: string): Promise<AzFile[]>; listPlaylists(): Promise<AzPlaylist[]>; playlistFiles(id: number): Promise<AzFile[]>; fileStream(id: string, range: string | null): Promise<Response> }` — envía la cabecera `X-API-Key`.

- [ ] **Step 1:** Pruebas con `fetchImpl` falso: `listFolders("")` pide `/api/station/<id>/files/list?currentDirectory=` con `X-API-Key` y mapea carpetas y archivos; un 401 lanza un error de dominio legible («Clave API no válida»); `saveStudioConfig` rechaza `http://` y a un rol sin `station:manage` (`editor`); con `apiKey` vacío no pisa la guardada; `getStudioConfig` nunca incluye la clave. Usar `makeDb()` de `tests/helpers.ts`.
- [ ] **Step 2:** `npx vitest run tests/studio-azuracast.test.ts` — falla.
- [ ] **Step 3:** Implementar. Los campos y rutas exactos de AzuraCast 0.24 se leen del OpenAPI público (`https://radio.stereoface.online/api/openapi.yml`): `/station/{station_id}/files/list`, `/files`, `/playlists`, exportación de la lista (`/playlist/{id}/export/m3u` o equivalente) y `/file/{id}/play`.
- [ ] **Step 4:** Pasa. Añadir la página de ajustes (URL, estación y clave; la clave se muestra solo como «guardada» o «sin clave») bajo `requirePermission("station:manage")`.
- [ ] **Step 5: Commit** `feat(studio): cliente de AzuraCast y ajuste de la clave API`.

### Task 10: Rutas proxy de biblioteca y audio

**Files:**
- Create: `src/app/api/studio/library/route.ts`, `src/app/api/studio/playlists/route.ts`, `src/app/api/studio/file/[id]/route.ts`

**Interfaces:**
- Consumes: `AzuraClient`, `getStudioConfig` (Task 9), sesión del admin.
- Produces: `GET /api/studio/library?path=<ruta>&q=<texto>` → `{ folders: AzFolder[]; files: AzFile[] }`; `GET /api/studio/playlists` → `AzPlaylist[]`; `GET /api/studio/playlists?id=<n>` → `AzFile[]`; `GET /api/studio/file/<id>` → audio con `Accept-Ranges` y `206` si llega `Range`.

- [ ] **Step 1:** Cada ruta exige sesión con `station:update` (401/403 si no) y valida `id` numérico y `path` sin `..`. La clave se lee en el servidor. Sin clave guardada: 409 con «Configura la clave de AzuraCast».
- [ ] **Step 2:** Prueba en `tests/studio-azuracast.test.ts`: la ruta de archivo reenvía `Range` y devuelve `206`; una petición sin sesión devuelve 401.
- [ ] **Step 3:** `npx tsc --noEmit && npx eslint src tests && npx vitest run` — pasan.
- [ ] **Step 4: Commit** `feat(studio): proxy de biblioteca y audio de AzuraCast`.

### Task 11: Panel de biblioteca en la consola

**Files:**
- Create: `src/ui/studio/LibraryPanel.tsx`
- Modify: `src/ui/studio/StudioConsole.tsx`, `src/ui/studio/engine/queue.ts` (`QueueItem.source` admite `"azuracast"` y se añade `url: string | null`), `src/ui/studio/engine/audio-engine.ts` (`loadDeck` acepta `url` además de `file`)

**Interfaces:**
- Consumes: rutas de Task 10, `QueueItem`, `queueReducer`.
- Produces: `<LibraryPanel onAdd: (items: QueueItem[]) => void />` con pestañas **Carpetas** (árbol navegable con migas de pan) y **Listas** (listas de reproducción de AzuraCast y su contenido), buscador, y arrastrar o doble clic para añadir a la cola; «Añadir carpeta o lista completa».

- [ ] **Step 1:** Ampliar `QueueItem` y actualizar `tests/studio-queue.test.ts` (un ítem de AzuraCast conserva su `url` y tiene `file: null`).
- [ ] **Step 2:** Implementar el panel; si la API devuelve 409, mostrar el enlace a `/admin/radio/studio/ajustes`.
- [ ] **Step 3:** `loadDeck` usa `url` (`new Audio(url)`, mismo origen) cuando no hay `file`.
- [ ] **Step 4:** Verificación en el navegador integrado con una clave API real: se listan las carpetas `yarn013`, `yarn014`, `yarn020`, `codesinnotes002`, `waag_rel068`, `malaventura01` y la lista «Creative Commons»; arrastrar una pista a la cola y cargarla en un deck suena con el medidor activo; añadir una carpeta completa mete sus pistas en orden.
- [ ] **Step 5: Commit** `feat(studio): biblioteca de AzuraCast en la consola`.

---

## Self-Review

- **Cobertura de la fase 1 del diseño:** motor, decks A/B, cola con dnd, crossfade, limitador, medidores, EN VIVO, metadatos, reconexión → Tasks 1–6; permisos y ruta → 7; criterios de aceptación 1, 2, 4, 5, 6 → Task 8 (se ejecuta al final, después de la 11); biblioteca de AzuraCast (carpetas y listas) → Tasks 9–11. El criterio 3 (jingle sobre la música con ducking) pertenece a la fase 2.
- **Fuera de este plan:** Cart Wall (fase 2), micrófono y ducking (fase 3), biblioteca del servidor (fase 4), pulido y atajos extra (fase 5). Cada una tendrá su plan.
- **Consistencia de tipos:** `QueueItem`, `LiveState`, `planCrossfade`, `equalPowerGains`, `rmsToDb`/`peakToDb`, `WebcastSender` y `AudioEngine` se definen una vez y se consumen con la misma firma.
