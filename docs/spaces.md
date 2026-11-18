# StereoFace Spaces — Fase 1

«Tu espacio. Tu sonido. Tu identidad.» Perfiles públicos personalizables de la comunidad.

## Rutas
| Ruta | Qué es |
|---|---|
| `/spaces` | Descubrimiento: destacados, recientes, búsqueda por usuario (`?q=`) y filtro por género (`?genero=`). |
| `/@usuario` | Perfil público (reescritura a `/spaces/u/usuario`). El dueño ve su borrador con `?vista=borrador`. |
| `/spaces/registro`, `/spaces/entrar`, `/spaces/recuperar`, `/spaces/restablecer?token=`, `/spaces/verificar?token=` | Cuenta. |
| `/spaces/crear` | Asistente de 5 pasos (usuario, géneros, plantilla, foto/portada/bio, publicar). |
| `/spaces/editar` | Editor visual con vista previa en vivo, autoguardado del borrador y publicación. |
| `/admin/spaces` | Administración: perfiles, destacar, desactivar, reportes, géneros y plantillas. |
| `GET/PUT/POST/DELETE /api/spaces/me/*`, `GET /api/spaces/artists`, `POST /api/spaces/report`, `GET /s/[key]` | API y servicio de imágenes. |

## Arquitectura
- **Cuentas:** tabla `users` y sesiones del sitio (cookie `sf_session`), con el rol nuevo `oyente` (ningún permiso de administración; si entra a `/admin` va a su Space). Sin sistema paralelo.
- **Datos** (migración `0012`): `space_profiles` (borrador y publicado), `space_genre_options`, `space_profile_genres`, `space_favorite_artists` (catálogo de StereoFace o nombre libre), `space_themes`, `space_assets`, `space_reports`, `auth_tokens`. Las migraciones de Drizzle solo avanzan (no hay «down»): se revierte con una copia de la base.
- **Diseño seguro:** el diseño es JSON validado con Zod (`src/modules/spaces/design.ts`): colores `#rrggbb`, fuentes y fondos de listas cerradas, bloques de una lista cerrada, enlaces https de dominios permitidos, claves desconocidas rechazadas, contraste mínimo texto/tarjeta. Nunca se guarda HTML, JavaScript ni CSS libre; el render lo convierte en variables `--sp-*` dentro de `.space`, así que no afecta al resto del sitio.
- **Propiedad:** todas las rutas `/api/spaces/me/*` actúan sobre la sesión y no aceptan identificadores de otra persona. Mutaciones con comprobación de `Origin` (además de SameSite=Lax).
- **Imágenes:** formato por contenido (firma), 5 MB cada una, 30 MB y 6 de galería por persona; ruta `/s/[key]` con `nosniff` y CSP `sandbox`; privadas en borrador, públicas al publicar, retiradas si se desactiva el Space o se marca la imagen.
- **Radio:** el bloque «Música» reutiliza el reproductor global (`useRadio`); nunca arranca solo. Enlaces externos de música solo https de dominios permitidos; no se sube música.
- **Nombres reservados:** `admin`, `api`, `spaces`, rutas del sitio, etc. (`username.ts`).

## Variables de entorno (opcionales)
`RESEND_API_KEY` y `EMAIL_FROM` activan el envío de correo (API HTTPS de Resend, sin dependencias nuevas). Sin ellas: **no se exige confirmar el correo** para publicar y la recuperación de contraseña responde que no está disponible. Con ellas: se envía el correo de confirmación al registrarse (el enlace pide un clic para confirmar, a prueba de prefetch) y se exige confirmarlo para publicar.

## Cómo probar
1. `/spaces/registro` → crear cuenta → asistente `/spaces/crear` → publicar → abrir `/@usuario`.
2. `/spaces/editar`: cambiar plantilla, colores, fondo (subir imagen), fuentes, bloques; mirar el estado «Guardado ✓»; «Publicar cambios».
3. Desde otro navegador: `/spaces` (aparece), `/@usuario` (radio con el botón de la barra; no suena sola), «⋯ → Reportar».
4. Como administrador: `/admin/spaces` (reportes, destacar, desactivar).
5. Pruebas: `npx vitest run tests/spaces-*.test.ts` (diseño, servicio, HTTP).

## Limitaciones reales
- El correo no se envía hasta configurar Resend (y verificar el dominio de envío allí).
- Aún no hay edición de plantillas con editor visual en el administrador (se activan/desactivan; su diseño se cambia por código o base de datos).
- Sin moderación automática de imágenes: solo reportes y marcado manual. Las imágenes marcadas no se pueden previsualizar en el administrador.
- Un Space desactivado no se puede ver ni siquiera por su dueño; la reactivación lo deja en borrador.
- Fase 1 únicamente: sin seguidores, Top 8, comentarios, muro ni salas de escucha.
