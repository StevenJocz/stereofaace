# Hero con titular completo y frase editorial

## Intención

La portada debe conservar el titular completo del artículo destacado, sin que una configuración abreviada lo reemplace. Debajo irá una frase breve de impacto; la bajada (`dek`) seguirá como contexto descriptivo. La sección «Selección del editor» usará una frase editorial, no una firma o contenido de demostración.

## Enfoque elegido

- El hero toma siempre `article.title` como fuente del titular y lo divide de forma legible en varias líneas visuales, sin truncarlo.
- `HeroConfig` añade `phrase?: string`, una frase específica por destacado. Se renderiza debajo del titular y antes de la bajada. Los bloques antiguos siguen funcionando sin ella.
- Para el destacado actual de Till Lindemann se registrará la frase: «Bogotá arde: Till Lindemann llega para encender la escena.»
- «Selección del editor» pasa a: «La música no solo suena: abre grietas, reúne cuerpos y cambia la noche.» y se elimina la atribución ficticia.
- El CTA «Leer más» del hero usa `next/link` para navegar internamente. El `RadioProvider` ya vive en el layout raíz, por lo que deja de desmontarse y la señal continúa al abrir el artículo.

## Límites

- No se cambia el título, la bajada ni el cuerpo editorial del artículo.
- No se activa ni modifica ninguna emisora de radio.
- La frase del hero no se deduce automáticamente: queda en la configuración del bloque para que sea editorialmente controlable.
