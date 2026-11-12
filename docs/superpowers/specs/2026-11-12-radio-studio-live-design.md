# StereoFace Radio Studio (en vivo) — diseño

Fecha: 2026-11-12 · Estado: pendiente de aprobación

## 1. Intención

Una consola web, al estilo de SAM Broadcaster PRO / RadioBOSS, para que un DJ o locutor de StereoFace **transmita en vivo** desde el navegador: reproduce música con dos decks y una cola de reproducción, lanza jingles y promos al instante, habla por el micrófono con ducking y manda la mezcla a la radio. No sustituye al AutoDJ de AzuraCast: cuando el DJ se desconecta, la radio vuelve sola al AutoDJ.

Por qué: hoy los DJs solo tienen el WebDJ genérico de AzuraCast (dos listas, sin cola, sin cart wall, sin ducking, interfaz ajena a StereoFace). El dueño quiere una herramienta propia, moderna y fácil, donde se arrastren canciones y se opere con soltura durante una emisión.

## 2. Objetivos

- Emitir en vivo hacia `radio.stereoface.online` con el usuario y contraseña de DJ de AzuraCast.
- Dos decks (A/B) con crossfade, ajuste de volumen y pre-escucha (PFL) por auriculares.
- Cola de reproducción: arrastrar canciones, reordenar, quitar; al terminar una pista, entra la siguiente (modo manual o automático).
- Cart Wall con jingles, promos, cortinillas y efectos; sonido instantáneo sobre la música, con ducking opcional.
- Micrófono con atajo «hablar» (la música baja mientras se habla) y control de ganancia.
- Master con limitador (sin clipping) y medidores de nivel en vivo.
- Metadatos: la canción en el aire se publica a AzuraCast y al reproductor público.
- **Biblioteca de AzuraCast como fuente de música** (decisión del dueño, 2026-11-12): todas las carpetas de medios y todas las listas de reproducción de la estación se pueden explorar y arrastrar a la cola. También se admiten archivos del computador del DJ.
- Jingles y promos compartidos entre DJs (guardados en StereoFace).
- Diseño propio de StereoFace: oscuro, modular, de uso rápido con atajos de teclado.

## 3. No-objetivos

- AutoDJ, horarios 24/7, rotaciones y listas de AzuraCast (siguen en su panel).
- Varios locutores a la vez, talkback y mezcla en el servidor (Etapa 2, con LiveKit Cloud).
- Estadísticas de audiencia, peticiones de oyentes, voice tracking (fases posteriores).
- Réplica pixel a pixel de SAM Broadcaster ni uso de sus recursos.

## 4. Anti-objetivos (fallo aunque «funcione»)

- Cortes, clics o saltos de volumen al cambiar de pista o al lanzar un jingle.
- Que la señal suene saturada (clipping) o con eco/retorno del micrófono.
- Que el DJ pierda la cola o los jingles por recargar la página.
- Que las credenciales de DJ queden guardadas en el servidor o en el código.

## 5. Restricciones y hechos verificados

- **Transporte (probado):** WebSocket `wss://radio.stereoface.online/webdj/stereo_face/` con el subprotocolo `webcast`. Se envía `{"type":"hello","data":{"mime","user","password"}}`, luego fragmentos binarios de `MediaRecorder` (`audio/webm;codecs=opus`, 128 kbps, `start(1000)`) y metadatos con `{"type":"metadata","data":{"title","artist"}}`. Es el mismo protocolo del WebDJ de AzuraCast.
- **Prueba de concepto realizada (2026-11-12):** una página con Web Audio, tono de 440 Hz y `MediaRecorder` conectó con la cuenta `dj1`; AzuraCast mostró `is_live = true` con el nombre «DJ 1» y el título enviado; la señal pública (`/listen/stereo_face/radio.mp3`) tenía su pico en 439 Hz; al parar, volvió al AutoDJ en pocos segundos. Pendiente de probar con micrófono real, un archivo de música y sesiones largas.
- La mezcla ocurre en el navegador del DJ: si la pestaña se cierra o el equipo se duerme, la transmisión se corta y vuelve el AutoDJ. Se mitiga con Wake Lock, aviso al cerrar y reconexión automática.
- Navegadores objetivo: Chrome y Edge (principal), Firefox. Safari sin garantía.
- Next.js 16 con Cache Components: la página del estudio es dinámica y 100 % cliente (Web Audio), bajo `Suspense` y `connection()` como el resto del admin.
- Permisos: reutilizar el recurso `station` del RBAC existente. Decisión: acceso al estudio con `station:update` (superadmin, admin y editor, según el RBAC existente); los ajustes con la clave de AzuraCast exigen `station:manage` (solo admin y superadmin). Un rol «DJ» propio requiere una migración y queda para después.
- Las credenciales del DJ (usuario y contraseña de AzuraCast) se escriben en la consola y viven solo en `sessionStorage`; nunca se envían a StereoFace ni se guardan.

## 6. Arquitectura

```
Navegador del DJ
  AudioContext ── Deck A ─┐
                  Deck B ─┤
                  Cart ───┼─► Bus música ─► Ducker ─► Master (limitador) ─► MediaStreamDestination ─► MediaRecorder ─► WebSocket webcast ─► AzuraCast (Liquidsoap) ─► Icecast
                  Mic ────┘                                          └─► Medidores
  Pre-escucha (PFL) ─► salida de auriculares (setSinkId)
StereoFace (servidor): proxy autenticado hacia la API de AzuraCast (lista de carpetas, archivos y listas; audio con soporte de Range) y tabla de carts + archivos de audio de jingles/promos
```

Módulos del cliente (`src/ui/studio/`): `engine/` (grafo de audio, decks, crossfade, ducker, limitador, transmisor webcast; sin React, probado con vitest), `store` (estado de cola, decks, carts y conexión), `components/` (cabecera «ahora suena», decks, cola, biblioteca, cart wall, mezclador, estado de emisión).

Servidor: tabla `studio_carts` (id, nombre, tipo `jingle|promo|sweeper|effect`, color, atajo, `media_key`, duración, ganancia, posición), servicio con `assertCan` + Zod + auditoría como el resto, subida de audio validada (MIME real, tamaño máximo, extensiones MP3/WAV/OGG/M4A/FLAC) y ruta de lectura `/media/<key>`.

## 7. Fases

1. **Núcleo de emisión:** motor de audio, deck A/B desde archivos locales, cola con arrastrar y soltar, crossfade, master con limitador, medidores, conexión EN VIVO/desconectar con metadatos y reconexión.
1b. **Biblioteca de AzuraCast:** ajuste con la clave API (guardada solo en el servidor), proxy de lectura y panel de biblioteca con carpetas y listas de reproducción, con búsqueda y arrastre a la cola.
2. **Cart Wall:** administración de jingles y promos en `/admin/radio/studio/carts` (subir, ordenar, color, atajo) y panel de botones en la consola; sonido instantáneo con ducking.
3. **Voz y sonido** (adelantada por pedido del dueño, 2026-11-12, antes del Cart Wall):
   - **Micrófono:** selección de dispositivo, ganancia, silencio (mute), medidor propio, botón «Hablar» (alternar) y atajo de mantener para hablar. El micrófono nunca se reproduce por los altavoces del DJ (evita el eco); solo sale al aire.
   - **Ducking automático:** cuando la voz supera un umbral, el volumen de la música de fondo baja a un nivel configurable y recupera suavemente al terminar. Ajustes: activado/desactivado, reducción en dB (por defecto −12), umbral de voz (por defecto −45 dB), ataque (por defecto 150 ms) y recuperación (por defecto 1,2 s). Hay un botón manual «Bajar música» que fuerza el ducking.
   - **Ecualizador de 3 bandas** (graves 100 Hz, medios 1 kHz, agudos 8 kHz, ±12 dB) por separado para la música y para el micrófono, con presets («Plano», «Voz de radio», «Música brillante»).
   - **Cadena del micrófono:** filtro pasa-altos a 80 Hz, puerta de ruido (gate) con umbral ajustable, compresor y ecualizador, antes de la mezcla.
4. **Listas guardadas:** listas de emisión guardables por DJ e historial de lo emitido.
5. **Pulido:** atajos de teclado, wake lock, aviso al cerrar, temas, accesibilidad de teclado, documentación para los DJs.

Cada fase termina con pruebas automatizadas del motor (vitest) y una verificación de extremo a extremo contra la señal pública, como la prueba de concepto.

## 8. Criterios de aceptación (núcleo)

1. Con `dj1`, pulsar EN VIVO pone la radio en vivo con el nombre del DJ; el título publicado coincide con la pista del deck activo.
2. Una canción arrastrada a la cola suena en el deck libre; al acabar la actual, entra la siguiente con crossfade sin cortes audibles.
3. Un jingle lanzado durante una canción se oye encima, y la música baja si el ducking está activo.
4. El nivel de salida no supera 0 dBFS (limitador activo).
5. Al desconectar o cerrar la pestaña, la radio vuelve al AutoDJ. Medido desde el oyente (2026-11-12): 16–18 s, por los buffers de AzuraCast (≈5 s en `input.harbor`), de Icecast y del navegador del oyente.
6. Si se pierde la conexión, la consola reintenta y avisa claramente del estado.

## 9. Decisiones mías (revisables)

- `dnd-kit` (MIT) para arrastrar y soltar; estado con React + reducer, sin librería extra.
- Formato de emisión `audio/webm;codecs=opus` a 128 kbps, igual al WebDJ de AzuraCast.
- Acceso con `station:update` y credenciales de DJ solo en `sessionStorage`.
- La clave API de AzuraCast se guarda en `site_settings` (clave `studio.azuracast`), solo la lee código de servidor con `station:manage` y nunca se envía al navegador; queda en las copias de seguridad de la base de datos. Si hiciera falta cifrarla, se necesita un secreto de aplicación que hoy no existe.
- El audio de la biblioteca se sirve por un proxy de StereoFace (mismo origen), así que no hay problemas de CORS al decodificar.

## 10. Riesgos

- Pestaña en segundo plano: el navegador puede reducir temporizadores; el audio sigue, pero la cola/crossfade deben usar el reloj de audio y no `setTimeout`.
- Latencia y buffer del WebDJ (≈5 s en `input.harbor`): el crossfade y el ducking se calculan en el navegador y llegan retrasados al oyente; es normal y no afecta la mezcla.
- Decodificación de archivos grandes: usar `MediaElementSource` en streaming, no decodificar completos.
- Derechos de la música: la plataforma no descarga ni retransmite música ajena; el DJ usa archivos que tiene derecho a emitir.
