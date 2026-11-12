# Diseño: imágenes editoriales persistentes

## Intención

Permitir que el equipo editorial suba imágenes propias o con derechos de uso desde el CMS para emplearlas como portada y dentro del cuerpo de cada artículo. Las fotografías deben sobrevivir a reconstrucciones o reinicios de los contenedores y mostrarse con una composición editorial de portada amplia, título, pie de foto y crédito; se toma como referencia la función, no el diseño ni los activos, del sitio indicado por el usuario.

## Objetivos

- Carga de una imagen desde el editor de artículos para usarla como portada y desde el editor de texto para insertarla dentro del contenido.
- Persistencia en un volumen Docker nombrado, montado en `/data/media` del servicio web.
- Acceso público solo mediante rutas controladas de StereoFace; los archivos no se exponen como un directorio navegable.
- Metadatos por imagen: texto alternativo obligatorio, crédito y licencia/permiso.
- Validar y limitar los archivos: JPEG, PNG, WebP o AVIF; máximo 10 MiB; rechazar SVG, GIF y tipos declarados que no correspondan al contenido.
- Nombres aleatorios internos, sin reutilizar nombres suministrados por el navegador, y protección contra traversal de rutas.
- Metadatos SEO y `NewsArticle` usan la URL local de la portada como imagen social cuando no se configure una imagen SEO distinta.
- Las imágenes existentes por URL y las ilustraciones generativas continúan funcionando.

## No objetivos

- Importar, descargar o reutilizar imágenes de Colectivo Sonoro, Cartel Urbano u otros medios.
- Galerías, recorte manual, compresión avanzada, CDN externa o biblioteca/gestión masiva de medios en esta entrega.
- Borrar archivos al eliminar un artículo: una imagen puede ser reutilizada y su borrado requiere una pantalla de medios con referencias, que queda para una fase posterior.

## Enfoques considerados

1. **Volumen Docker local (seleccionado).** El servicio Next.js recibe la subida, valida el archivo y lo guarda en un volumen `stereoface_media`; PostgreSQL conserva los metadatos y la relación con el artículo. Es persistente, no introduce servicios adicionales y encaja con el servidor actual.
2. MinIO/S3. Facilita crecimiento y CDN, pero agrega credenciales, mantenimiento y costo que aún no son necesarios.
3. URLs externas. Ya existe, pero deja la disponibilidad, optimización y derechos operativos fuera del control de StereoFace.

## Arquitectura

- `POST /api/media` recibe un `multipart/form-data`, exige sesión y permiso `media:create`, valida el archivo y crea una fila `media` con una clave aleatoria.
- El binario se escribe de forma atómica bajo `/data/media/<clave>.<extensión>` y la tabla `media` registra MIME, bytes, dimensiones, accesibilidad, crédito, licencia y autor de subida.
- `GET /media/[key]` resuelve solo claves válidas registradas, fija un `Content-Type` seguro y `Cache-Control` inmutable. Ninguna ruta utiliza nombres originales ni paths enviados por el cliente.
- El artículo conserva `cover_id`; su URL pública se resuelve desde el medio relacionado. El campo legado `cover_url` mantiene compatibilidad con portadas externas.
- La interfaz muestra un selector de archivo, progreso/errores, vista previa, los metadatos exigidos y una acción «Usar como portada». El editor Tiptap ofrece «Imagen» para insertar la URL ya subida en el cuerpo con `alt`.
- Docker Compose monta `stereoface_media:/data/media` en `web` y en cualquier tarea que necesite leer medios. La guía de despliegue documenta cómo incluir ese volumen en las copias del servidor.

## Reglas editoriales y de seguridad

- Solo una persona autenticada con el permiso `media:create` puede cargar archivos.
- El formulario exige un texto alternativo significativo. Para contenido de terceros se registra autor/crédito y licencia o permiso; para material propio se puede usar la licencia `Propia`.
- Los navegadores solo reciben imágenes por la ruta pública controlada, no por un montaje de Docker ni por el sistema de archivos.
- La carga fallida limpia el archivo temporal; el registro de base de datos se crea únicamente tras validar y escribir correctamente el binario.

## Éxito verificable

1. Un administrador puede cargar una foto JPG/WebP/PNG/AVIF de hasta 10 MiB, completar su atribución y usarla como portada.
2. Tras `docker compose up --build` y reinicio del contenedor, la portada continúa accesible y devuelve el tipo MIME correcto.
3. Los formatos, tamaños, sesiones y permisos inválidos reciben errores sin crear archivos o registros huérfanos.
4. La URL de la portada aparece como `og:image` y `image` en `NewsArticle` para una noticia publicada.
