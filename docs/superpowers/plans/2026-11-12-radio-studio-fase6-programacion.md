# Radio Studio — Fase 6: programación de StereoFace Radio · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Programas con nombre, imagen y locutores; una parrilla semanal con excepciones puntuales; el reproductor público muestra el programa que suena ahora (solo para StereoFace Radio) y, al pulsarlo, abre un modal con la programación del día, la semana o el mes.

**Architecture:** Tablas `radio_programs` y `radio_schedule` (migración 0005). Lógica de expansión de la parrilla pura en `src/modules/schedule/occurrences.ts` (zona `America/Bogota`, UTC−5 fijo, sin horario de verano). Servicio con `assertCan` + Zod + auditoría, rutas públicas de solo lectura con caché corta y administración en `/admin/radio/programacion`. La barra de radio consulta «ahora» y abre el modal.

**Tech Stack:** Next.js 16.4, Drizzle + PGlite (pruebas) / pg, Zod 4, React 19, vitest.

**Spec:** este plan nace de un pedido del dueño (2026-11-12): programa con imagen visible en el reproductor, modal de programación día/semana/mes, solo para StereoFace. Se añade a `docs/superpowers/specs/2026-11-12-radio-studio-live-design.md` como fase 6.

## Global Constraints

- Zona horaria fija `America/Bogota` (UTC−5, sin DST). Las horas se guardan como `HH:MM` locales; `once` guarda además una fecha `YYYY-MM-DD`.
- Un tramo puede cruzar la medianoche (`22:00–02:00`): se expande en dos ocurrencias consecutivas.
- Prioridad: una ocurrencia `once` en conflicto con una semanal la **sustituye** para ese intervalo.
- Solo se aplica a la emisora propia: slug `stereoface-radio` (constante `OWN_STATION_SLUG`). Otras emisoras de Frecuencias no muestran programa.
- Lectura pública (`/api/radio/now`, `/api/radio/schedule`): solo programas activos; sin datos internos (ids de usuario, notas). Caché `public, max-age=0, s-maxage=30, stale-while-revalidate=30`.
- Rango máximo de `/api/radio/schedule`: 62 días; parámetros inválidos → 400.
- Permisos: ver y editar programación = `station:update`; borrar programa = `station:delete`. El servidor decide.
- Imagen de programa: del módulo de medios existente (`photo_id` → `/media/<key>`); sin imagen, un degradado con la inicial.
- Sin `any`; `tsc`, `eslint`, `vitest` y `next build` (sin `DATABASE_URL`) en verde antes de cada commit. Textos en español. Rutas de API: `await connection()` primero.

## Review Focus

- Un tramo que cruza la medianoche aparece en los dos días y «ahora» lo detecta a las 00:30. (Task 1)
- Dos tramos solapados el mismo día: gana el puntual (`once`) sobre el semanal; entre dos semanales, el que empieza más tarde. (Task 1)
- Sin ningún programa en la hora actual: «ahora» devuelve `null` y la barra no muestra programa, sin errores. (Task 1, Task 4)
- Un programa desactivado o borrado desaparece de la parrilla y del modal. (Task 2)
- Rango de meses largo o fechas invertidas: 400, no una consulta enorme. (Task 3)
- Imagen faltante o URL rota: el modal y la barra siguen funcionando con el degradado. (Task 4)

---

### Task 1: Expansión de la parrilla (lógica pura)

**Files:** Create `src/modules/schedule/occurrences.ts`; Test `tests/schedule-occurrences.test.ts`.

**Interfaces — Produces:**
- `type Slot = { id: string; programId: string; kind: "weekly" | "once"; weekday: number | null; date: string | null; start: string; end: string }` (`weekday` 0=domingo…6=sábado; `start`/`end` `HH:MM`)
- `type Occurrence = { slotId: string; programId: string; kind: "weekly" | "once"; startsAt: Date; endsAt: Date }`
- `occurrencesBetween(slots: Slot[], from: Date, to: Date): Occurrence[]` — ordenadas por `startsAt`; aplica la prioridad (puntual sobre semanal; sin solapes finales: la ocurrencia que pierde se recorta o se descarta)
- `currentOccurrence(slots: Slot[], now: Date): Occurrence | null`
- `bogotaParts(d: Date): { date: string; weekday: number; minutes: number }`

- [ ] **Step 1: Pruebas que fallan** — tramo semanal lunes 18:00–20:00 genera la ocurrencia del lunes 2026-11-16 de 23:00Z a 01:00Z (UTC−5); un tramo `22:00–02:00` del viernes aparece viernes 22:00 → sábado 02:00 y `currentOccurrence` a las 00:30 del sábado (hora Bogotá) lo devuelve; `once` en 2026-11-17 14:00–15:00 sustituye a un semanal martes 13:00–16:00 (la ocurrencia semanal queda en 13:00–14:00 y 15:00–16:00); `currentOccurrence` sin tramos → `null`; un `from` posterior a `to` → `[]`; el rango incluye ocurrencias que empiezan antes de `from` y terminan dentro; `end` igual a `start` se ignora (tramo vacío).
- [ ] **Step 2:** `npx vitest run tests/schedule-occurrences.test.ts` — falla.
- [ ] **Step 3:** Implementar con aritmética de minutos locales de Bogotá (offset fijo −300), sin `Intl` ni `Date` locales.
- [ ] **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(schedule): expansión de la parrilla semanal y puntual`.

### Task 2: Esquema, servicio y administración

**Files:** Create `src/modules/schedule/schema.ts`, `drizzle/0005_schedule.sql`, `src/modules/schedule/service.ts`; Modify `src/db/schema.ts`, `drizzle/meta/*`; Test `tests/schedule-service.test.ts`.

**Interfaces — Produces:**
- `radioPrograms`: `id uuid pk`, `slug text unique`, `name text`, `description text null`, `hosts text null`, `photoId uuid null → media`, `color text` (`#rrggbb`, por defecto `#c6ff00`), `active boolean default true`, `createdAt`, `updatedAt`, `deletedAt null`.
- `radioSchedule`: `id uuid pk`, `programId uuid → radioPrograms (cascade)`, `kind text`, `weekday int null`, `date date null`, `startTime text`, `endTime text`, `createdAt`.
- Servicio: `listProgramsAdmin(db, actor)`, `saveProgram(db, actor, input: { id?: string; name: string; description?: string; hosts?: string; photoId?: string; color?: string; active?: boolean }): Promise<{ id: string; slug: string }>` (slug único con `uniqueSlug`), `deleteProgram(db, actor, id)` (lógico), `listSlotsAdmin(db, actor)`, `addSlot(db, actor, input: { programId: string; kind: "weekly" | "once"; weekday?: number; date?: string; start: string; end: string })`, `removeSlot(db, actor, id)`.
- Validación: `HH:MM` 00:00–23:59; `weekly` exige `weekday` 0–6 y prohíbe `date`; `once` exige `date` y prohíbe `weekday`; `start !== end`.

- [ ] **Step 1: Pruebas** — crear programa genera slug único (`mi-programa`, `mi-programa-2`); redactor no puede (403); `addSlot` rechaza `25:00`, `weekly` sin weekday y `once` con weekday; borrar programa lo oculta de la lista pública y borra sus tramos de la lista; `saveProgram` con `photoId` inexistente → `DomainError`; auditoría registra `schedule.program.save` sin datos sensibles.
- [ ] **Step 2:** Falla. **Step 3:** Escribir esquema, generar la migración con `drizzle-kit generate`, implementar. **Step 4:** `npx vitest run` completo — pasa (migra PGlite).
- [ ] **Step 5:** Página `/admin/radio/programacion` (`station:update`): lista de programas con alta/edición (nombre, descripción, locutores, imagen con `MediaPicker`, color, activo) y editor de tramos (semanal por día y horas, o puntual por fecha) con vista previa de la semana; enlace desde la navegación del admin.
- [ ] **Step 6: Commit** `feat(schedule): programas y parrilla con administración`.

### Task 3: Lectura pública (API)

**Files:** Create `src/modules/schedule/public.ts`, `src/app/api/radio/now/route.ts`, `src/app/api/radio/schedule/route.ts`; Test `tests/schedule-public.test.ts`.

**Interfaces — Produces:**
- `type PublicProgram = { slug: string; name: string; description: string | null; hosts: string | null; imageUrl: string | null; color: string }`
- `getNowPlaying(db, now?: Date): Promise<{ program: PublicProgram; startsAt: string; endsAt: string; next: { program: PublicProgram; startsAt: string } | null } | null>`
- `getSchedule(db, from: Date, to: Date): Promise<{ program: PublicProgram; startsAt: string; endsAt: string }[]>` (rechaza `to - from` > 62 días con `DomainError("range_too_large")`)
- Rutas: `GET /api/radio/now` → `{ now: … | null }`; `GET /api/radio/schedule?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ items: [...] }` (fechas locales de Bogotá, `to` inclusivo); 400 ante parámetros inválidos.

- [ ] **Step 1: Pruebas** — con un programa activo y un tramo que cubre «ahora» devuelve el programa, el fin y el siguiente; sin tramo → `null`; programa inactivo o borrado no aparece; imagen → `/media/<key>`; rango de 63 días → error; fechas invertidas → error; la respuesta no incluye campos internos (`createdAt`, ids de usuario).
- [ ] **Step 2:** Falla. **Step 3:** Implementar y rutas finas (`await connection()`, cabecera de caché). **Step 4:** Pasa.
- [ ] **Step 5: Commit** `feat(schedule): API pública de programa actual y parrilla`.

### Task 4: Reproductor y modal de programación

**Files:** Create `src/ui/radio/ScheduleModal.tsx`, `src/ui/radio/useNowPlayingProgram.ts`; Modify `src/ui/radio/RadioBar.tsx`, `src/app/globals.css`; Test: lógica pura en `tests/schedule-view.test.ts` sobre `src/ui/radio/schedule-view.ts`.

**Interfaces — Produces (`schedule-view.ts`, puro):** `groupByDay(items: { startsAt: string; endsAt: string; … }[]): { date: string; label: string; items: … }[]` (agrupa por fecha de Bogotá, ordenado), `monthGrid(year: number, month: number): { date: string; inMonth: boolean }[]` (semanas completas, lunes primero), `formatRange(startsAt: string, endsAt: string): string` (`18:00–20:00`).

- [ ] **Step 1: Pruebas** — `groupByDay` agrupa por día de Bogotá (una ocurrencia a las 23:30 Bogotá cae en su día aunque en UTC sea el siguiente); `monthGrid(2026, 11)` empieza en lunes y tiene filas completas de 7; `formatRange` devuelve `18:00–20:00`.
- [ ] **Step 2:** Falla. **Step 3:** Implementar lo puro. **Step 4:** Pasa.
- [ ] **Step 5:** `useNowPlayingProgram` consulta `/api/radio/now` cada 60 s solo cuando la emisora activa es `stereoface-radio`. `RadioBar`: si hay programa, muestra su imagen (o degradado), el nombre y «hasta HH:MM», y el bloque es un botón («Ver programación») que abre `ScheduleModal`. Para otras emisoras no se muestra nada nuevo.
- [ ] **Step 6:** `ScheduleModal` (`<dialog>` accesible, cierra con Escape, devuelve el foco): pestañas **Hoy**, **Semana** y **Mes**; «Hoy» y «Semana» listan por día con imagen, nombre, locutores y horario, resaltando el programa actual; «Mes» muestra la cuadrícula con puntos por día y, al elegir un día, su lista; navegación anterior/siguiente; estado de carga y vacío («Aún no hay programación publicada»).
- [ ] **Step 7:** Verificación en el navegador con datos de prueba (programa con imagen, tramos de hoy): la barra muestra el programa actual, el clic abre el modal, las tres vistas cargan, Escape cierra, una emisora distinta no muestra programa, y sin programación el modal muestra el estado vacío.
- [ ] **Step 8: Commit** `feat(schedule): programa en el reproductor y modal de programación`.

### Task 5: Integración con el estudio

**Files:** Modify `src/ui/studio/LiveBar.tsx`, `src/ui/studio/StudioConsole.tsx`.

- [ ] **Step 1:** La consola muestra «Programa ahora: <nombre> (hasta HH:MM)» y «Siguiente: <nombre> a las HH:MM» consultando `/api/radio/now` (mismo origen) cada 60 s, y los envía como parte del metadato de emisión cuando el DJ está EN VIVO (`artist` = nombre del programa si el DJ no ha escrito otro). Si no hay programa, no muestra nada.
- [ ] **Step 2:** Verificación en navegador y `tsc`/`eslint`/`vitest` en verde.
- [ ] **Step 3: Commit** `feat(studio): programa actual y siguiente en la consola`.

---

## Self-Review

- **Cobertura del pedido:** nombre e imagen del programa → Task 2; aparece en el reproductor solo para StereoFace → Task 4; clic abre modal con día/semana/mes → Task 4; administración de programas y horarios → Task 2; estudio muestra el programa → Task 5.
- **Consistencia de tipos:** `Slot`, `Occurrence`, `PublicProgram` se definen en las Tasks 1–3 y se consumen igual en 4–5.
- **Fuera de este plan:** notificaciones o recordatorios de programa, programas grabados en AutoDJ (AzuraCast ya tiene su propia programación de listas).
