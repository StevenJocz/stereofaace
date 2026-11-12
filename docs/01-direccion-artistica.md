# StereoFace — Dirección artística (Fase 1)

## Referencias analizadas

**Cartel Urbano** (referencia conceptual, no visual). Estructura por secciones temáticas, titulares largos con dos puntos, etiqueta de sección en minúsculas, fecha abreviada, portada con una nota principal grande y luego filas de tarjetas con y sin imagen, "Ver más" como paginación, pie con licencia y red de proyectos hermanos. Lección: la identidad viene de la voz y de las secciones propias, no del layout. Lo que superamos: jerarquía visual plana, tarjetas repetidas, sin ritmo de revista.

**Referencia visual aportada por el cliente** (estilo "REM PHASE"): fotografía en escala de grises con sujeto recortado, un único color de acento, ticker horizontal gigante, ficha técnica en mono con barra de totales y código de barras, wordmark extendido contra tipografía condensada ligera, banda negra inferior. Lo que tomamos: la disciplina monocroma + un acento, los datos como gráfico, el ticker. Lo que NO tomamos: su composición, su naranja, el menú en píldora redondeada, su logotipo.

**Awwwards / galerías**: Wax Poetics (revista musical, texturas y hovers), Platter (zine brutalista: condensada + grotesca pesada + serif + mono, radio 0), chkchkchk y El futuro que fue (brutalismo, cursor y scroll). Lo que las hace destacar: una sola idea gráfica repetida con disciplina, tipografía como imagen, metadatos como textura, movimiento con intención.

## Tres direcciones

**A — «Xerox Flyer»**. Fotocopia, tramas, cinta, sellos rotados, mono. Muy underground y reconocible. Riesgo: pastiche, cansa en lectura larga, se ve "de moda".

**B — «Signal Grid»**. Retícula suiza rígida de 12 columnas, titulares condensados enormes, líneas finas, metadatos en mono, fotografía monocroma a gran escala, mucho aire. Sofisticada y escalable al CMS. Riesgo: fría si no hay una idea propia.

**C — «Afterhours»**. Fotografía cinematográfica a sangre, tipografía serif itálica, luz de club. Riesgo: cae en gradientes genéricos, pesa en rendimiento, depende de fotos excelentes que aún no existen.

## Criterios (1–5)

| Criterio | A | B | C |
|---|---|---|---|
| Originalidad y memoria de marca | 4 | 3 | 3 |
| Lectura larga y accesibilidad | 2 | 5 | 3 |
| Escala con CMS y contenido real variable | 2 | 5 | 2 |
| Rendimiento (Core Web Vitals) | 4 | 5 | 2 |
| Encaje con la referencia aportada | 4 | 5 | 3 |
| Funciona sin fotografía propia todavía | 4 | 4 | 1 |
| **Total** | 20 | 27 | 14 |

## Decisión: «Signal / Noise» (B con una dosis controlada de A)

La estructura es **Signal**: retícula suiza, jerarquía limpia, lectura impecable. El **Noise** entra solo en puntos marcados: sellos, ticker, registro de impresión, grano.

**Idea gráfica central: el canal estéreo.** El nombre es StereoFace: dos canales, una cara. Toda imagen principal puede partirse en canal L y canal R con un desfase mínimo. Al pasar el cursor las mitades se separan y se realinean. Es el único efecto repetido en todo el sitio; da identidad y no estorba la lectura.

### Sistema
- **Color.** Tinta `#0A0A0A`, hueso `#EDEBE4`, carbón `#1A1A1A`, gris medio `#8A8A84`. Acento único **verde ácido `#C6FF00`**. Cada portada puede inyectar un color secundario vía `--cover`, usado solo en etiquetas y subrayados. Oscuro por defecto; claro (hueso) disponible.
- **Tipografía.** Display: **Archivo** variable con eje de ancho (de 62 a 125): condensada para titulares, extendida para el wordmark. Lectura: **Newsreader**. Datos: **JetBrains Mono**. Escala fluida con `clamp()`.
- **Forma.** Radio 0. Líneas de 1 px. Sin gradientes: el volumen se hace con trama, grano y blanco/negro.
- **Elementos gráficos.** Ficha técnica (agenda, lanzamientos) con filas en mono, total y código de barras del número de edición; ticker horizontal; marcas de registro en esquinas; numeración de edición.
- **Imagen.** Monocroma por defecto (filtro de escala de grises en CSS) con color solo al hover. Mientras no haya fotografía propia, portadas generativas en SVG, siempre marcadas **DEMO**.
- **Movimiento.** GSAP solo en: revelado de titulares, ticker, separación L/R, transición de menú, scroll en especiales. Todo respeta `prefers-reduced-motion`.
- **Móvil.** Diseñado aparte: columna única con titular a sangre, ficha técnica convertida en lista apilada, menú a pantalla completa.

### Anti-metas
Sin píldoras ni esquinas redondeadas, sin gradientes, sin tarjetas idénticas en serie, sin dashboard corporativo, sin movimiento que tape el texto.

---

## Revisión 1 (2026-11-10): «Neon Signal»

Tras ver el segundo concepto del cliente (portada de StereoFace con feed lateral, riel de categorías y tarjetas), la dirección pasa de la retícula suiza sobria a una versión más cercana a ese concepto, conservando las reglas del brief.

**Cambios**
- Paleta: negro con verde ácido `#c6ff00` y violeta `#9b6bff` como segundo acento; ámbar y azul solo en el riel. Modo claro con tinta oscura para texto de acento.
- Tipografía: Archivo itálica extendida y pesada para titulares; Archivo normal para texto y tarjetas; JetBrains Mono para datos. Newsreader queda reservada para el cuerpo de artículos largos (se reincorpora en la fase de artículos).
- Forma: radio de 10 px en paneles y tarjetas, etiquetas inclinadas, botones circulares. Sin degradados decorativos; el único degradado es un velo oscuro bajo texto sobre imagen.
- Imagen: escenas vectoriales generativas (multitud con haces de luz, vinilo, DJ con anillos, ondas, picos de festival) y una figura de portada. Son marcadores de posición, siempre con etiqueta DEMO; se sustituyen por fotografía licenciada o propia.
- Se mantiene el motivo estéreo L/R (artistas y bloque Electrónica | Indie).

**Movimiento**
- Intro de carga (una vez por sesión, solo en inicio) con onda, wordmark por letras y contador.
- Hero como carrusel real: entrada de titulares por máscara, transición entre slides, parallax del puntero, barra de progreso, pausa por botón, hover, foco y pestaña oculta, flechas de teclado.
- Reveals al scroll, titulares enmascarados, ticker que se inclina con la velocidad del scroll, contadores, barra de cabecera que se oculta al bajar.
- `prefers-reduced-motion`: sin intro, sin autoplay y sin transiciones; todo visible y estático. Si el movimiento no arranca en 6 s, el script de arranque lo desactiva y deja el contenido visible.
