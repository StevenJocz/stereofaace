# SEO de StereoFace: auditoría y trabajo en curso

Fecha: 24 de noviembre de 2026. Los cambios de aplicación se desplegaron desde `main` en la revisión `791441b`, mediante el flujo CI/CD.

## Diagnóstico inicial

StereoFace es una aplicación Next.js 16 / React 19 con contenido dinámico en PostgreSQL, radio persistente, páginas editoriales, eventos, lanzamientos, artistas y Spaces. Los artículos públicos ya tienen canonical, Open Graph, NewsArticle y migas de pan en JSON-LD; hay sitemap dinámico y robots.txt. El panel ya ofrecía título, descripción, slug y `noindex` para artículos.

Prioridad alta:

- El sitemap general no respetaba `noindex` ni canonical externa de artículos.
- El editor de artículos no exponía canonical ni imagen social y podía borrar esos datos al guardar.
- Lighthouse móvil detectó imágenes excesivamente grandes y no encontró la meta descripción de portada en su auditoría. Hay que investigar la interacción de metadatos dinámicos y streaming antes de alterar su estrategia de renderizado.
- La ficha de redacción en JSON-LD se presentaba como persona; las fechas de actualización no se mostraban de forma explícita.
- Los perfiles editoriales ficticios deben permanecer identificados como tales; auditar su posible indexación antes de pedir inclusión en Google News.

Prioridad media:

- No existía sitemap especializado de noticias ni opción explícita de vista previa grande para Discover.
- Las imágenes posteriores del carrusel se solicitaban sin diferirlas ni priorizar la primera.
- El flujo RSS deduplica por fuente y URL, verifica términos y crea borradores, pero no garantiza originalidad ni derechos por sí solo y requiere revisión humana, deduplicación entre fuentes y tratamiento de imágenes.
- Páginas de autores, señales editoriales, programación radial y transmisiones requieren una revisión específica; no se ha certificado la elegibilidad para News o Discover.

## Cambios implementados en la rama

- Sitemap general excluye artículos no indexables o con canonical diferente.
- Editor de artículos permite conservar y editar canonical e imagen social; ambas validan HTTPS sin credenciales.
- Twitter Cards usa la imagen social seleccionada o la portada.
- Sitemap `/news-sitemap.xml` para notas manuales, no demo, creadas y publicadas en las últimas 48 horas, indexables y canónicas; excluye importaciones RSS por precaución editorial. `robots.txt` anuncia ambos sitemaps.
- Noticias incluyen `max-image-preview:large`, fecha visible de actualización cuando difiere y tipo `Organization` para firmas de redacción.
- Carrusel prioriza la primera imagen y difiere las siguientes.
- Portadas de la biblioteca propia utilizan el optimizador de Next.js y `srcset` adaptable, tanto en el carrusel como en las tarjetas. Solo se optimizan rutas `/media/` del mismo origen; las imágenes externas siguen sirviéndose como antes. El ahorro real y el comportamiento en el contenedor requieren medición tras el despliegue.

Archivos: `src/lib/seo.ts`, `src/lib/news-sitemap.ts`, `src/lib/local-media-image.ts`, `src/app/sitemap.ts`, `src/app/news-sitemap.xml/route.ts`, `src/app/robots.ts`, `src/app/(public)/noticias/[slug]/page.tsx`, `src/modules/content/service.ts`, `src/modules/content/validators.ts`, `src/ui/HeroSlider.tsx`, `src/ui/ArticleCover.tsx`, `src/ui/admin/ArticleEditor.tsx`, `src/app/(admin)/admin/(panel)/articulos/[id]/page.tsx` y pruebas correspondientes.

## Medición y pruebas

Una ejecución Lighthouse 13.6.0 móvil de la portada pública antes de los cambios, 24 de noviembre de 2026: SEO 92/100, rendimiento 53/100, accesibilidad 100/100, buenas prácticas 100/100; LCP 15,6 s, CLS 0,017 y TBT 420 ms. El informe completo está en `seo-auditoria/lighthouse-home-antes.json`. Son resultados de laboratorio de una sola ejecución, no datos de usuarios ni INP real. Lighthouse identificó una portada JPEG de 4 MB y un ahorro estimado de imágenes de 5.703 KiB.

Tras el despliegue, la portada, `/robots.txt`, `/sitemap.xml` y `/news-sitemap.xml` respondieron 200 y una imagen optimizada de `/media/` respondió 200. Una ejecución Lighthouse móvil posterior obtuvo SEO 92/100, rendimiento 71/100, LCP 5,7 s, CLS 0,0012 y TBT 204 ms. El informe está en `seo-auditoria/lighthouse-home-despues.json`. Comparación orientativa de una ejecución antes y una después: son mediciones de laboratorio sujetas a variación, no INP ni datos de usuarios reales. No se ha completado un rastreo exhaustivo de enlaces.

El 24 de noviembre de 2026, `npm test` completó 839 pruebas en 93 archivos; `npm run typecheck` y `npm run build` terminaron correctamente. Durante el prerender hubo avisos porque no se configuró `DATABASE_URL` en el entorno local; esto no equivale a una prueba funcional con datos de producción. `npm run lint` terminó sin errores, con una advertencia existente por `StatusPill` sin usar en `RadioBar.tsx`. Las pruebas del optimizador comprueban el marcado generado, no su funcionamiento completo dentro del contenedor.

## Google News, Discover y contenido original

La presencia de NewsArticle o un sitemap no garantiza elegibilidad ni distribución. Google pide que el sitemap de noticias solo incluya artículos recientes y recomienda imágenes pertinentes de al menos 1200 px y `max-image-preview:large` para Discover. Fuentes: [sitemaps de noticias](https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap), [datos estructurados de artículos](https://developers.google.com/search/docs/appearance/structured-data/article), [Discover](https://developers.google.com/search/docs/appearance/google-discover).

El equipo debe comprobar autoría, fecha real, fuentes, licencia de texto e imagen, aporte propio y enlaces oficiales antes de publicar. Un resumen RSS o atribución por sí solos no prueban permiso para republicar contenido. No usar titulares engañosos, autores inventados ni fechas artificialmente renovadas. Las notas importadas no entran en el sitemap News mientras no exista una señal explícita y verificable de revisión editorial original.

## Search Console y Bing

1. Añadir `stereoface.online` como propiedad de dominio en [Google Search Console](https://search.google.com/search-console) y verificar el registro DNS TXT proporcionado por Google en Cloudflare.
2. En Sitemaps, enviar `https://stereoface.online/sitemap.xml` y, después del despliegue, `https://stereoface.online/news-sitemap.xml`. Inspeccionar portada y muestras de artículo, artista, evento y programa.
3. Añadir o importar el sitio en [Bing Webmaster Tools](https://www.bing.com/webmasters/), verificarlo y enviar los sitemaps. Revisar cobertura, rastreo y términos de búsqueda.
4. No poner tokens de verificación en repositorios públicos. El envío no garantiza indexación ni posicionamiento.

## Estrategia y pendientes

Priorizar noticias originales de electrónica, indie y escena underground colombiana, particularmente Antioquia; desarrollar fichas de artistas y DJ, crónicas de eventos, programación de radio y guías de géneros con enlaces entre sí. Expandir internacionalmente mediante cobertura latinoamericana y contenidos multilingües solo cuando haya traducciones reales y `hreflang` correctamente implementado. Medir búsquedas reales en Search Console antes de priorizar palabras clave; las frases sugeridas no representan volumen medido.

Pendiente: rastreo completo de enlaces/canónicas y duplicados; páginas verificables de autores; metadatos y datos estructurados específicos de radio en directo; medición real de la optimización de imágenes y LCP/INP/CLS; revisión de todas las vistas previas sociales; panel SEO para otros tipos de contenido; deduplicación entre fuentes RSS resistente a ejecuciones simultáneas; políticas explícitas de originalidad y duplicidad para RSS; validación con Rich Results Test, Search Console y Bing; mediciones posteriores móvil y escritorio y prueba visual en dispositivos. No se ha implementado ni validado toda la optimización solicitada.

Mantenimiento: revisar semanalmente cobertura y errores de rastreo, mensualmente rendimiento real y consultas, comprobar licencias y fuentes antes de publicar, y volver a medir Lighthouse tras cada cambio importante. Google no exige archivos o marcado especiales para sus funciones de IA: [guía de Google](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
