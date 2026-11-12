# Radio Studio — Fase 3: voz y sonido · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Micrófono con cadena de voz (pasa-altos, puerta, compresor, EQ), ducking automático y manual de la música de fondo, y ecualizador de 3 bandas independiente para música y micrófono, integrados a la consola en vivo.

**Architecture:** La lógica de decisión (ducking, puerta, ecualizador) es pura y vive en `src/ui/studio/engine/` con pruebas en Node. `AudioEngine` añade las cadenas Web Audio y un bucle de control que lee el nivel del micrófono y aplica la ganancia de ducking con `setTargetAtTime`. La interfaz añade paneles de micrófono, ducking y ecualizador.

**Tech Stack:** Web Audio API (`BiquadFilterNode`, `DynamicsCompressorNode`, `GainNode`, `AnalyserNode`), `getUserMedia`, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-11-12-radio-studio-live-design.md` (fase 3). **Plan anterior:** `docs/superpowers/plans/2026-11-12-radio-studio-fase1-nucleo.md` (motor, consola y emisión ya hechos).

## Global Constraints

- El micrófono NUNCA va al monitor local (altavoces del DJ); solo al bus de emisión y a su medidor.
- Ducking por defecto: activado, reducción `−12` dB, umbral `−45` dB, ataque `150` ms, recuperación `1200` ms.
- EQ: 3 bandas — graves `lowshelf` 100 Hz, medios `peaking` 1000 Hz (Q 1), agudos `highshelf` 8000 Hz; ganancia acotada a ±12 dB.
- Cadena del micrófono: `highpass` 80 Hz → puerta de ruido → `DynamicsCompressorNode` → EQ → ganancia → bus.
- Cronometraje de rampas con el reloj de audio (`AudioParam.setTargetAtTime`), no con `setTimeout`.
- `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` al pedir el micrófono (la cadena propia lo trata).
- Sin `any`; `tsc`, `eslint` y `vitest` en verde antes de cada commit. Textos en español.

## Review Focus

- Permiso de micrófono denegado o sin dispositivos: mensaje claro, la consola sigue funcionando sin micrófono. (Task 3)
- El dispositivo elegido desaparece (se desconecta el micrófono USB): aviso, la música no queda atenuada para siempre. (Task 1, Task 3)
- Ruido breve (un golpe) no dispara el ducking por debajo del tiempo de ataque; el silencio breve entre palabras no hace «bombear» la música (se mantiene hasta que pasa la recuperación). (Task 1)
- Mute del micrófono con ducking activo: la música recupera su volumen. (Task 1)
- Valores fuera de rango en los ajustes (reducción positiva, umbral > 0, EQ ±40 dB): se acotan sin romper. (Task 1, Task 2)

---

## File Structure

- `src/ui/studio/engine/voice.ts` — `dbToGain`, `gainToDb`, `DuckController`, `GateController`.
- `src/ui/studio/engine/eq.ts` — modelo de ecualizador, presets y `clampEq`.
- `src/ui/studio/engine/audio-engine.ts` — modificar: cadena de música con EQ y ducker; cadena de micrófono; bucle de control.
- `src/ui/studio/MicPanel.tsx`, `DuckingPanel.tsx`, `EqPanel.tsx` — paneles nuevos.
- `src/ui/studio/StudioConsole.tsx` — modificar: estado y conexión de los paneles.
- Pruebas: `tests/studio-voice.test.ts`, `tests/studio-eq.test.ts`.

---

### Task 1: Lógica de ducking y puerta

**Files:**
- Create: `src/ui/studio/engine/voice.ts`
- Test: `tests/studio-voice.test.ts`

**Interfaces:**
- Produces:
  - `dbToGain(db: number): number` (`10^(db/20)`), `gainToDb(g: number): number` (piso −100)
  - `type DuckSettings = { enabled: boolean; reductionDb: number; thresholdDb: number; attackMs: number; releaseMs: number }`; `DEFAULT_DUCK: DuckSettings`; `clampDuck(s: DuckSettings): DuckSettings` (reducción en `[-40, 0]`, umbral en `[-80, -10]`, ataque en `[10, 1000]`, recuperación en `[100, 5000]`)
  - `class DuckController { constructor(settings: DuckSettings); setSettings(s: DuckSettings): void; setForced(on: boolean): void; update(input: { micDb: number; micMuted: boolean; nowMs: number }): { targetGain: number; timeConstantSec: number } }` — `targetGain = dbToGain(reductionDb)` mientras haya voz sostenida (nivel > umbral durante al menos `attackMs`) o el modo forzado esté activo; `1` si está deshabilitado, el micrófono está en mute o la voz cesó hace más de `releaseMs` (la voz se mantiene `holdMs = 300` tras la última superación para no «bombear» entre palabras). `timeConstantSec` es `attackMs/1000/3` al bajar y `releaseMs/1000/3` al subir.
  - `class GateController { constructor(thresholdDb: number, holdMs?: number); update(micDb: number, nowMs: number): number }` — `1` si el nivel supera el umbral o lo superó hace menos de `holdMs` (por defecto 200); si no, `0`.

- [ ] **Step 1: Escribir las pruebas que fallan** — `dbToGain(-6)` ≈ 0.501, `dbToGain(0)` = 1, `gainToDb(0)` = −100. `clampDuck` acota `reductionDb: 5` a `0`, `thresholdDb: 0` a `-10`, `attackMs: 1` a `10`. `DuckController` (con `DEFAULT_DUCK`): voz a −30 dB durante 100 ms (menos que el ataque) → `targetGain` 1; a 200 ms → ≈ 0.251 (−12 dB); silencio tras voz, a los 200 ms → sigue ≈ 0.251 (hold); a los 1500 ms de silencio → 1; `micMuted: true` → 1 siempre; `enabled: false` → 1; `setForced(true)` → ≈ 0.251 sin voz, y `setForced(false)` vuelve a 1 pasada la recuperación. `GateController(-50)`: −60 dB → 0; −40 dB → 1; −60 dB 100 ms después de −40 → 1 (hold); a 300 ms → 0.
- [ ] **Step 2:** `npx vitest run tests/studio-voice.test.ts` — falla por módulo inexistente.
- [ ] **Step 3:** Implementar según las firmas.
- [ ] **Step 4:** Mismo comando — pasa.
- [ ] **Step 5: Commit** `feat(studio): lógica pura de ducking y puerta de ruido`.

### Task 2: Ecualizador

**Files:**
- Create: `src/ui/studio/engine/eq.ts`
- Test: `tests/studio-eq.test.ts`

**Interfaces:**
- Produces:
  - `type EqSettings = { low: number; mid: number; high: number }` (dB)
  - `FLAT_EQ`, `EQ_PRESETS: Record<"plano" | "voz" | "brillante", { label: string; music: EqSettings; mic: EqSettings }>`
  - `clampEq(e: EqSettings): EqSettings` — cada banda en `[-12, 12]`, `NaN` → 0
  - `EQ_BANDS: readonly { key: keyof EqSettings; type: "lowshelf" | "peaking" | "highshelf"; frequency: number; q: number }[]`

- [ ] **Step 1: Pruebas** — `clampEq({low: 40, mid: -40, high: NaN})` → `{low:12, mid:-12, high:0}`; `EQ_BANDS` tiene 3 bandas con las frecuencias 100, 1000 y 8000 y los tipos de las restricciones; `EQ_PRESETS.plano.music` es plano; `EQ_PRESETS.voz.mic.high > 0` y `EQ_PRESETS.voz.mic.low < 0` (voz más clara, sin retumbe).
- [ ] **Step 2:** `npx vitest run tests/studio-eq.test.ts` — falla.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(studio): modelo del ecualizador de 3 bandas y presets`.

### Task 3: Cadenas de audio del motor (música con EQ y ducker, micrófono)

**Files:**
- Modify: `src/ui/studio/engine/audio-engine.ts`

**Interfaces:**
- Consumes: `DuckController`, `GateController`, `dbToGain` (Task 1); `EQ_BANDS`, `clampEq` (Task 2); `peakToDb`/`rmsToDb` (fase 1).
- Produces (nuevos miembros de `AudioEngine`):
  - `listMics(): Promise<{ id: string; label: string }[]>`
  - `startMic(deviceId?: string): Promise<void>` — pide `getUserMedia({ audio: { deviceId, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })`; errores traducidos: `NotAllowedError` → «Permiso de micrófono denegado», `NotFoundError` → «No se encontró ningún micrófono»
  - `attachMicStream(stream: MediaStream): void` (punto de entrada común; permite inyectar un flujo de prueba)
  - `stopMic(): void`, `setMicMuted(m: boolean)`, `setMicGain(g: number)`, `setMicGateThreshold(db: number)`
  - `setDuck(s: DuckSettings)`, `setDuckForced(on: boolean)`
  - `setEq(target: "music" | "mic", e: EqSettings)`
  - `getMicLevelDb(): number`, `getDuckGainDb(): number`
  - `onMicLost: (() => void) | null` (se dispara si la pista del micrófono termina)
- Grafo: música `decks → mix(música) → EQ música (3 BiquadFilter) → duckGain → bus`; micrófono `source → highpass 80 Hz → gateGain → compresor → EQ mic → micGain → bus`. `bus` es el `mix` existente (antes del limitador). El micrófono NO se conecta al monitor.

- [ ] **Step 1:** Implementar. El bucle de control corre cada 30 ms mientras haya micrófono: lee el nivel del micrófono (antes de la puerta), obtiene `gate` de `GateController` y `targetGain` de `DuckController`, y aplica `gateGain.gain.setTargetAtTime(gate, now, 0.01)` y `duckGain.gain.setTargetAtTime(targetGain, now, timeConstantSec)`. Si el micrófono se pierde (`track.onended`), se detiene la cadena, `targetGain` vuelve a 1 y se llama `onMicLost`.
- [ ] **Step 2:** `npx tsc --noEmit` y `npx eslint src` sin errores.
- [ ] **Step 3: Verificación en el navegador (sin micrófono físico):** con un `MediaStream` de un oscilador de 200 Hz inyectado con `attachMicStream`, y un deck reproduciendo un tono de 440 Hz, comprobar (a) con la voz presente `getDuckGainDb()` baja hacia −12 dB en ≲ 0,5 s y el nivel del deck en el master baja unos 12 dB; (b) al parar el oscilador, la música recupera su nivel en ≈ 1,5 s; (c) `setMicMuted(true)` con ducking activo devuelve la música a 0 dB; (d) la salida del monitor no contiene los 200 Hz (el micrófono no está en el monitor).
- [ ] **Step 4: Commit** `feat(studio): micrófono, ecualizador y ducking en el motor de audio`.

### Task 4: Paneles de micrófono, ducking y ecualizador

**Files:**
- Create: `src/ui/studio/MicPanel.tsx`, `src/ui/studio/DuckingPanel.tsx`, `src/ui/studio/EqPanel.tsx`
- Modify: `src/ui/studio/StudioConsole.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: miembros nuevos de `AudioEngine` (Task 3), `DuckSettings`/`DEFAULT_DUCK`/`clampDuck` (Task 1), `EqSettings`/`EQ_PRESETS`/`clampEq` (Task 2).
- Produces: `<MicPanel />`, `<DuckingPanel />`, `<EqPanel />` con props controladas (valor + `onChange`), y su integración en `StudioConsole`.

Contenido:
- `MicPanel`: selector de dispositivo (se recarga tras conceder permiso), botón **Activar micrófono / Apagar**, botón **Hablar** (alternar = mute/unmute) y mantener la tecla `V` para hablar, ganancia, umbral de la puerta, medidor de nivel, aviso de error visible (`role="alert"`).
- `DuckingPanel`: interruptor, deslizadores de reducción, umbral, ataque y recuperación, botón **Bajar música** (forzar, mantener), indicador de reducción actual en dB.
- `EqPanel`: tres deslizadores verticales por canal (Música y Micrófono), selector de preset y botón «Plano».
- El orden visual: LiveBar → decks → fila de [Micrófono | Ducking | EQ] → cola y biblioteca.

- [ ] **Step 1:** Implementar los paneles y conectarlos en `StudioConsole` (estado en `useState`, aplicando cada cambio al motor con los métodos de la Task 3). Si el motor aún no existe, activar el micrófono lo crea tras el gesto del usuario (`resume()`).
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint src tests && npx vitest run` — todo pasa.
- [ ] **Step 3: Commit** `feat(studio): paneles de micrófono, ducking y ecualizador`.

### Task 5: Verificación de extremo a extremo y despliegue

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1:** En el navegador integrado (servidor local), con la consola conectada EN VIVO como `dj1`: un deck con tono de 440 Hz y un micrófono simulado (oscilador de 200 Hz inyectado). Con la señal pública analizada desde una pestaña de `stereoface.online`: con la voz presente, el pico de 440 Hz baja ≈ 12 dB frente a antes y aparece el de 200 Hz; sin voz, la música vuelve; la EQ de música (graves −12 dB) cambia el nivel del tono bajo en el master.
- [ ] **Step 2:** Probar permiso denegado: sin permiso se ve «Permiso de micrófono denegado» y la consola sigue usable.
- [ ] **Step 3:** Documentar en `PROGRESS.md` qué se probó y que el micrófono físico real queda por probar por el dueño; `git push` y esperar el despliegue automático.
- [ ] **Step 4: Commit** `docs: estado de voz y sonido (fase 3)`.

---

## Self-Review

- **Cobertura del diseño (fase 3):** micrófono con selección, ganancia, mute y «Hablar» → Tasks 3–4; ducking con umbral, reducción, ataque y recuperación y botón manual → Tasks 1, 3, 4; ecualizador de música y micrófono con presets → Tasks 2–4; cadena del micrófono (pasa-altos, puerta, compresor, EQ) → Task 3; el micrófono fuera del monitor → Task 3 (paso 3d).
- **Fuera de este plan:** Cart Wall (fase 2), listas guardadas (fase 4), pulido (fase 5), prueba con micrófono físico.
- **Consistencia de tipos:** `DuckSettings`, `EqSettings`, `DuckController`, `GateController`, `EQ_BANDS` se definen en las Tasks 1–2 y se consumen con las mismas firmas en 3–4.
