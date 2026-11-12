# Administrador completo de StereoFace — diseño

Fecha: 2026-11-11 · Estado: **pendiente de aprobación** (nada construido todavía)

## Intención
Hoy el panel `/admin` solo gestiona artículos y radio. Todo lo demás que muestra la web (portada, artistas,
lanzamientos, agenda, categorías, imágenes, suscriptores, ajustes, usuarios) solo se cambia tocando la base de
datos o el código. La persona que usa el panel es el **superadministrador** y quiere gestionar **todo** el contenido
desde ahí, sin código.

## Objetivos
1. Cada bloque de contenido de la web tiene su pantalla de gestión: listar, buscar, crear, editar, publicar/despublicar y borrar.
2. El panel de inicio muestra cifras reales y accesos directos (hoy dice «disponible en la siguiente fase»).
3. La navegación del panel agrupa todas las secciones y funciona en móvil.
4. Cada cambio queda en el registro de auditoría y respeta los permisos por rol ya definidos (`src/lib/rbac.ts`).
5. Sin cambiar el diseño público: la web se ve igual; solo el contenido pasa a ser editable.

## No objetivos
- Crear páginas públicas nuevas de artistas, lanzamientos o agenda (`/artistas`, `/agenda`…). Siguen siendo secciones de la portada.
- Enviar correos del newsletter (no hay proveedor). Solo se ven, filtran y exportan los suscriptores.
- Motor automático de noticias (ingesta, IA): queda fuera. Solo se gestionan las **fuentes** como registro (ver «Fuentes»).
- Rediseñar el editor de artículos ni la radio (ya funcionan).
- Anti-objetivo: que editar desde el panel pueda romper la portada (p. ej. dejar el hero vacío o con un artículo borrado). Cada pantalla valida y avisa.

## Secciones (en este orden de construcción)

### 1. Portada (hero y destacados)
Tabla `home_blocks` (ya existe). Pantalla `/admin/portada`:
- **Hero:** lista ordenable (subir/bajar) de slides. Cada slide = un artículo publicado + `HeroConfig` (líneas del titular, desde qué línea va en acento, frase, ruta «Música / Cultura / Escena», texto del botón, meta, lugar, usar figura). Activar/desactivar, quitar, añadir.
- **Destacados:** lo mismo, sin configuración.
- Vista previa del titular partido en líneas (usa `splitHeroTitle`). Aviso si hay menos de 1 slide activo.

### 2. Artistas
CRUD sobre `artists` con el validador existente (`artistInputSchema`): nombre, slug, bio, país, géneros, enlaces (Spotify, SoundCloud, Bandcamp, YouTube, Instagram, web), foto (subida de medios), destacado. Borrado lógico (`deleted_at`). Búsqueda y filtro por destacado/demo.

### 3. Lanzamientos
CRUD sobre `releases` (`releaseInputSchema`): título, tipo, fecha, sello, artistas (1–10, ordenables), portada, URL del reproductor (solo hosts oficiales permitidos), estado borrador/publicado. Borrado lógico.

### 4. Agenda (eventos)
CRUD sobre `events` (`eventInputSchema`): nombre, tipo, inicio/fin, lugar, ciudad, país, descripción, género, artistas, enlace oficial de entradas, portada, estado borrador/publicado/cancelado. Borrado lógico.

### 5. Taxonomía
Categorías (nombre, slug, descripción, color, orden — el orden define el ticker y el riel), etiquetas y géneros (nombre, slug, familia). No se puede borrar una categoría/género en uso: se muestra cuántos elementos la usan y se pide reasignar o quitar primero.

### 6. Medios
Biblioteca de imágenes subidas (ya existe `POST /api/media` y la tabla `media`): rejilla con miniatura, texto alternativo, crédito y licencia editables, dónde se usa, y borrado solo si no está en uso. Un selector reutilizable de medios sustituye a «pegar URL» en artistas, lanzamientos y eventos.

### 7. Suscriptores
Lista con búsqueda y filtro por estado (pendiente/confirmado/baja), conteos, cambio de estado, borrado (derecho de supresión) y exportación CSV. Solo lectura y gestión: no envía correos.

### 8. Ajustes del sitio y páginas
- **Ajustes** (`site_settings`, clave/valor): nombre y descripción del sitio, redes sociales, textos del newsletter y del pie, metadatos SEO por defecto. Se conectan a la web solo en los puntos que hoy leen texto fijo, sin cambiar el aspecto.
- **Páginas fijas** (`pages`): título, slug, cuerpo con el mismo editor Tiptap y estado; hoy no hay ninguna.

### 9. Usuarios y auditoría
- **Usuarios** (solo superadmin/admin): crear, cambiar rol, activar/desactivar, restablecer contraseña. Un admin no puede asignar ni quitar `superadmin` (regla `canAssignRole` ya existente). No se puede dejar el sistema sin ningún superadmin activo.
- **Auditoría:** tabla de solo lectura, filtrable por entidad, usuario y fecha.

### 10. Fuentes de noticias (solo registro)
CRUD de `sources` (nombre, tipo, URL, política de derechos, notas legales, verificado). Nacen desactivadas, como define el esquema. No se ejecuta ninguna ingesta.

### 11. Panel de inicio y navegación
Cifras reales (artículos por estado, artistas, lanzamientos, eventos próximos, suscriptores pendientes, emisoras), últimos cambios de auditoría y accesos directos. Navegación agrupada: *Contenido* (artículos, portada, páginas), *Catálogo* (artistas, lanzamientos, agenda), *Organización* (taxonomía, medios), *Audiencia* (suscriptores, radio), *Sistema* (ajustes, usuarios, auditoría, fuentes).

## Restricciones y decisiones técnicas
- Se reutiliza el patrón existente: servicios en `src/modules/<x>/service.ts` con `assertCan` + Zod + `recordAudit`; páginas en `src/app/(admin)/admin/(panel)/<x>`; acciones de servidor con el mismo manejo de errores que `radio/actions.ts` (se extrae a un helper común).
- **Sin migraciones de base de datos** previstas: todas las tablas necesarias existen. Si aparece una necesidad real (p. ej. orden de artistas), se avisa antes.
- Pruebas Vitest por servicio (permisos, validación, borrado lógico, auditoría, reglas de «en uso») siguiendo `tests/`.
- Tras cada cambio se revalida `/` y las rutas afectadas para que la portada se actualice.
- Accesibilidad: formularios con etiquetas, errores por campo, navegación por teclado.

## Decisiones mías (a confirmar al leer)
- Borrado lógico en artistas, lanzamientos y eventos (ya hay `deleted_at`); borrado real solo en suscriptores, medios sin uso y taxonomía sin uso.
- Las páginas públicas de artistas/lanzamientos/agenda **no** se crean.
- Los ajustes se limitan a lo que la web realmente lee; no se añade un editor de colores/tema.
- Se construye por fases en el orden de arriba; cada fase se prueba y se entrega funcionando antes de seguir.

## Qué queda a criterio de quien construye
Maquetación exacta de tablas y formularios (coherente con `radio/` y el editor de artículos), nombres de rutas dentro de `/admin`, y el helper compartido de acciones.
