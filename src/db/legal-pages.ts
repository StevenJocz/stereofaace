/**
 * Páginas legales y de presentación que el sitio necesita (también para solicitar publicidad).
 * Se cargan una sola vez (idempotente): si el administrador las edita en el panel, nunca se pisan.
 * Son textos base: conviene que los revise quien opera el sitio y, si es posible, un abogado.
 */
export type LegalPage = { slug: string; title: string; description: string; html: string };

const UPDATED = "17 de noviembre de 2026";

export const LEGAL_PAGES: LegalPage[] = [
  {
    slug: "sobre-nosotros",
    title: "Sobre StereoFace",
    description: "Qué es StereoFace: una plataforma de noticias, artistas, eventos y radio de música electrónica, indie y underground.",
    html: `
<p>StereoFace es una plataforma cultural independiente, creada en Colombia, dedicada a la música electrónica, el indie y la escena underground de Latinoamérica y el mundo.</p>
<h2>Qué encuentras aquí</h2>
<ul>
<li><strong>Noticias y reportajes</strong> sobre lanzamientos, conciertos, festivales y escena.</li>
<li><strong>Artistas</strong>: perfiles con sus enlaces oficiales.</li>
<li><strong>Agenda</strong> de eventos y fechas confirmadas.</li>
<li><strong>StereoFace Radio</strong>, una emisora en línea con programación, DJ en vivo y música seleccionada.</li>
</ul>
<h2>Cómo trabajamos</h2>
<p>Citamos siempre las fuentes de las notas y damos crédito a quienes hacen las fotografías y los materiales que usamos. Si eres artista, sello, medio o fotógrafo y quieres que corrijamos, ampliemos o retiremos algo, escríbenos desde la página de <a href="/pagina/contacto">Contacto</a>: lo revisamos con prioridad.</p>
<h2>Quién está detrás</h2>
<p>StereoFace es un proyecto creado y operado por Steven Jocz, en Colombia.</p>
<p>Más información: <a href="/pagina/privacidad">Política de privacidad</a> · <a href="/pagina/cookies">Política de cookies</a> · <a href="/pagina/terminos">Términos de uso</a>.</p>`,
  },
  {
    slug: "contacto",
    title: "Contacto",
    description: "Cómo comunicarte con el equipo de StereoFace: correcciones, solicitudes de retiro, colaboraciones y publicidad.",
    html: `
<p>Estamos abiertos a escuchar a artistas, sellos, medios, anunciantes y lectores.</p>
<h2>Para qué escribirnos</h2>
<ul>
<li><strong>Correcciones o aclaraciones</strong> sobre una nota publicada.</li>
<li><strong>Solicitudes de retiro o crédito</strong> de imágenes, textos o música.</li>
<li><strong>Derechos sobre tus datos personales</strong> (conocer, actualizar, rectificar o suprimir).</li>
<li><strong>Colaboraciones, patrocinios y publicidad</strong>.</li>
<li><strong>Envío de música y comunicados</strong> de prensa.</li>
</ul>
<h2>Dónde encontrarnos</h2>
<p>Puedes escribirnos por mensaje directo en nuestra página de Facebook, <a href="https://www.facebook.com/StereofaceVIP/" rel="noopener noreferrer" target="_blank">StereofaceVIP</a>, y por las redes que aparecen en el pie de página del sitio.</p>
<p>Respondemos en un plazo máximo de 15 días hábiles. Las solicitudes de retiro de contenido se atienden con prioridad.</p>`,
  },
  {
    slug: "privacidad",
    title: "Política de privacidad",
    description: "Cómo StereoFace trata los datos personales de quienes visitan el sitio, se suscriben al boletín o escuchan la radio.",
    html: `
<p><em>Última actualización: ${UPDATED}.</em></p>
<p>Esta política explica qué datos personales trata StereoFace, para qué los usa y cuáles son tus derechos, de acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013 de Colombia (protección de datos personales).</p>
<h2>1. Responsable del tratamiento</h2>
<p>El responsable es StereoFace, proyecto operado por Steven Jocz, en Colombia. Puedes contactarnos desde la página de <a href="/pagina/contacto">Contacto</a>.</p>
<h2>2. Qué datos tratamos</h2>
<ul>
<li><strong>Correo electrónico</strong>, si te suscribes al boletín. Solo lo usamos para enviarte el boletín y avisos relacionados.</li>
<li><strong>Datos técnicos de navegación</strong> (dirección IP, navegador, páginas visitadas, fecha y hora) que registran los servidores y el proveedor de seguridad y entrega de contenido, para proteger el sitio y evitar abusos.</li>
<li><strong>Datos de la radio</strong>: al escuchar StereoFace Radio, el servicio de transmisión registra datos técnicos de la conexión (por ejemplo, dirección IP y duración de la escucha) para estadísticas de audiencia.</li>
<li><strong>Cookies y tecnologías similares</strong>, según se explica en la <a href="/pagina/cookies">Política de cookies</a>.</li>
</ul>
<p>No recopilamos datos sensibles ni datos de menores de edad de forma intencional.</p>
<h2>3. Para qué los usamos</h2>
<ul>
<li>Enviar el boletín a quienes lo solicitan.</li>
<li>Mantener la seguridad y el funcionamiento del sitio y de la radio.</li>
<li>Medir de forma agregada qué contenidos interesan, para mejorar el sitio.</li>
<li>Mostrar publicidad, solo si aceptas las cookies de publicidad (ver sección 5).</li>
<li>Atender tus solicitudes y cumplir obligaciones legales.</li>
</ul>
<h2>4. Tus derechos</h2>
<p>Como titular de los datos puedes: conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado del uso que damos a tus datos; presentar quejas ante la Superintendencia de Industria y Comercio; revocar la autorización y solicitar la supresión de tus datos; y acceder a ellos de forma gratuita. Para ejercerlos escríbenos desde la página de <a href="/pagina/contacto">Contacto</a>. Para darte de baja del boletín también puedes usar el enlace incluido en cada envío.</p>
<h2>5. Publicidad de terceros</h2>
<p>Este sitio puede mostrar anuncios de Google AdSense y de otros proveedores. Estos terceros usan cookies y otros identificadores para mostrar anuncios según tus visitas a este y otros sitios. Solo se cargan si lo aceptas en el aviso de cookies, y puedes cambiar tu decisión cuando quieras desde el enlace «Preferencias de cookies» del pie de página. Google explica cómo usa los datos en <a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer" target="_blank">policies.google.com/technologies/partner-sites</a>, y puedes administrar los anuncios personalizados en <a href="https://adssettings.google.com" rel="noopener noreferrer" target="_blank">adssettings.google.com</a>.</p>
<h2>6. Servicios de terceros</h2>
<p>Para funcionar usamos proveedores como servicios de alojamiento y seguridad, transmisión de radio, reproductores de audio y video incrustados (YouTube, Spotify, SoundCloud) y la red social Facebook, donde compartimos nuestras notas. Cada uno trata los datos según su propia política.</p>
<h2>7. Conservación y seguridad</h2>
<p>Conservamos los datos solo el tiempo necesario para las finalidades descritas y aplicamos medidas técnicas razonables para protegerlos. Los datos de suscripción se eliminan cuando pides la baja o la supresión.</p>
<h2>8. Cambios</h2>
<p>Podemos actualizar esta política. La fecha de arriba indica la última versión vigente.</p>`,
  },
  {
    slug: "cookies",
    title: "Política de cookies",
    description: "Qué cookies usa StereoFace, para qué sirven y cómo puedes aceptarlas, rechazarlas o cambiar tu decisión.",
    html: `
<p><em>Última actualización: ${UPDATED}.</em></p>
<p>Las cookies son pequeños archivos que el navegador guarda al visitar un sitio. Esta página explica cuáles usamos y cómo controlarlas.</p>
<h2>Cookies necesarias</h2>
<p>Son imprescindibles para que el sitio funcione (por ejemplo, recordar tus preferencias de volumen de la radio, el tema claro u oscuro, o mantener la sesión de quienes administran el sitio). No requieren consentimiento y no se usan para publicidad.</p>
<h2>Cookies de publicidad</h2>
<p>Si activamos publicidad, proveedores como Google AdSense pueden guardar cookies para mostrar anuncios y medir su rendimiento. <strong>No se cargan hasta que las aceptes</strong> en el aviso que aparece al entrar. Si las rechazas, no se muestran anuncios de ese tipo.</p>
<h2>Cómo cambiar tu decisión</h2>
<ul>
<li>Usa el enlace <strong>«Preferencias de cookies»</strong> en el pie de página para aceptar o rechazar de nuevo.</li>
<li>Desde la configuración de tu navegador puedes borrar o bloquear cookies. Ten en cuenta que bloquear las necesarias puede afectar el funcionamiento del sitio.</li>
<li>Para administrar anuncios personalizados de Google, visita <a href="https://adssettings.google.com" rel="noopener noreferrer" target="_blank">adssettings.google.com</a>.</li>
</ul>
<h2>Más información</h2>
<p>Consulta nuestra <a href="/pagina/privacidad">Política de privacidad</a> para saber cómo tratamos tus datos personales.</p>`,
  },
  {
    slug: "terminos",
    title: "Términos de uso",
    description: "Condiciones de uso del sitio y de la radio de StereoFace: contenidos, propiedad intelectual, enlaces y responsabilidad.",
    html: `
<p><em>Última actualización: ${UPDATED}.</em></p>
<p>Al usar StereoFace aceptas estos términos. Si no estás de acuerdo, te pedimos que no uses el sitio.</p>
<h2>1. Qué es StereoFace</h2>
<p>StereoFace es un medio digital y una radio en línea sobre música electrónica, indie y cultura underground. Los contenidos son informativos y culturales.</p>
<h2>2. Contenidos y fuentes</h2>
<p>Nuestras notas se basan en fuentes que citamos al final de cada texto. Hacemos lo posible por que la información sea correcta, pero puede cambiar (fechas, lugares, boletería). Verifica los datos importantes con los organizadores antes de comprar o viajar.</p>
<h2>3. Propiedad intelectual</h2>
<p>Los textos originales de StereoFace pertenecen a sus autores y al sitio; puedes citarlos mencionando la fuente y enlazando a la nota. Las imágenes, logotipos y música de terceros pertenecen a sus titulares y se muestran con crédito. Si eres titular de derechos y deseas que retiremos o acreditemos algo, escríbenos desde <a href="/pagina/contacto">Contacto</a> y lo atenderemos a la brevedad.</p>
<h2>4. Radio</h2>
<p>La programación de StereoFace Radio puede incluir música propia, de licencia libre y señales de terceros retransmitidas con autorización de sus titulares. La señal es para escucha personal; no está permitido grabarla ni retransmitirla sin permiso.</p>
<h2>5. Enlaces y servicios de terceros</h2>
<p>El sitio enlaza a páginas, reproductores y redes de terceros. No controlamos su contenido ni sus políticas y no respondemos por ellos.</p>
<h2>6. Publicidad y patrocinios</h2>
<p>El sitio puede mostrar publicidad, siempre identificada como tal, y contenidos patrocinados, que se marcan de forma clara. La presencia de un anuncio no implica que respaldemos el producto o servicio.</p>
<h2>7. Uso adecuado</h2>
<p>No está permitido intentar vulnerar la seguridad del sitio, extraer contenidos de forma masiva, ni usarlo para fines ilícitos.</p>
<h2>8. Limitación de responsabilidad</h2>
<p>El sitio y la radio se ofrecen «tal cual», sin garantía de disponibilidad continua. No respondemos por daños derivados de su uso, en la medida permitida por la ley.</p>
<h2>9. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes de la República de Colombia.</p>
<h2>10. Cambios</h2>
<p>Podemos modificar estos términos; la fecha de arriba indica la versión vigente. Para dudas, visita <a href="/pagina/contacto">Contacto</a>.</p>`,
  },
];
