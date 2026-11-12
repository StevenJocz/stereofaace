# Guía del DJ — Estudio en vivo de StereoFace Radio

El estudio está en **`/admin/radio/studio`** (menú del administrador: «Estudio»). Se transmite desde el navegador: Chrome, Edge o Firefox actualizados. Safari no está garantizado.

## 1. Antes de empezar

- Necesitas tu **usuario y contraseña de DJ** de AzuraCast (por ejemplo `dj1`). Si no los tienes, pídeselos a un administrador. Se escriben en la consola y solo se guardan en esta pestaña del navegador; StereoFace no los guarda.
- **Deja la pestaña abierta y visible mientras transmites.** Si la cierras o el equipo se duerme, la transmisión se corta y la radio vuelve sola al AutoDJ. La consola mantiene la pantalla encendida mientras estás EN VIVO y te avisa si intentas cerrar la pestaña.
- Usa auriculares si vas a hablar por el micrófono: así evitas el eco.

## 2. Salir al aire

1. Escribe tu usuario y contraseña de DJ.
2. Carga música en un deck (ver abajo) y pulsa **EN VIVO**.
3. La barra muestra **EN VIVO** con el tiempo al aire. Si el servidor no responde se reintenta solo; si la contraseña es incorrecta verás «Usuario o contraseña incorrectos».
4. Para terminar pulsa **Terminar**. La radio vuelve al AutoDJ; quien escucha lo nota unos 15 a 20 segundos después por el retraso normal del streaming.

## 3. Música

- **Arrastra canciones de tu computador** a la cola, o usa **Añadir archivos**. Solo se aceptan archivos de audio (MP3, WAV, OGG, M4A, FLAC).
- La **Biblioteca** (derecha) muestra la música de AzuraCast: pestañas **Carpetas** y **Listas**. Doble clic o el botón **+** añade una pista; **Añadir todo** mete la carpeta o lista completa.
- En la cola, arrastra por el asa `⋮⋮` para reordenar. **A** y **B** cargan la pista en ese deck; no se puede cargar en el deck que está al aire.
- **Siguiente automática**: cuando una pista llega a su final, la siguiente de la cola entra con un fundido de 6 segundos. Las pistas muy cortas pasan en seco.
- Los discos giran mientras suenan y muestran la carátula de la pista cuando la tiene.
- **Guardadas**: guarda la cola actual como lista (solo pistas de la biblioteca de AzuraCast) y cárgala otro día. **Historial**: lo que salió al aire, con exportación a CSV.

## 4. Jingles, promos y efectos (Cart Wall)

- Los botones del **Cart Wall** suenan al instante **encima de la música**. Si el cart tiene activada la opción «Bajar la música», la música baja mientras suena.
- Un segundo toque lo reinicia. **Detener** o la tecla `Esc` corta todos.
- El atajo de cada cart se ve en su botón. Se administran en **Gestionar** (`/admin/radio/studio/carts`): nombre, tipo, color, atajo, ganancia y orden.

## 5. Micrófono y sonido

- **Activar micrófono** pide permiso al navegador. Elige el dispositivo si tienes varios.
- **Silenciar / Hablar** alterna el micrófono. Manteniendo la tecla `V` hablas mientras está silenciado.
- **Música de fondo (ducking):** cuando hablas, la música baja sola. Ajusta la reducción, el umbral de voz, el ataque y la recuperación. **Bajar música (mantener)** la baja a mano.
- **Ecualizador:** graves, medios y agudos por separado para la música y el micrófono, con presets («Voz de radio», «Música brillante»).
- La **puerta de ruido** corta el ruido de fondo cuando no hablas; súbela si se cuela ruido y bájala si te corta las palabras.

## 6. Atajos

| Tecla | Acción |
|---|---|
| Espacio | Play / pausa del deck al aire |
| `V` (mantener) | Hablar con el micrófono silenciado |
| Tecla del cart | Disparar ese cart |
| `Esc` | Detener todos los carts |
| `?` | Ver esta ayuda dentro del estudio |

## 7. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| «Usuario o contraseña incorrectos» | Revisa los datos; pide a un administrador que confirme tu cuenta de DJ. |
| «Reconectando…» muchas veces | Revisa tu internet. Tras 8 intentos sin conectar, la consola se detiene y avisa. |
| «Permiso de micrófono denegado» | Permite el micrófono en el candado de la barra de direcciones y vuelve a activarlo. |
| «No se encontró ningún micrófono» | Conecta uno o elige otro dispositivo. |
| La biblioteca dice que falta la clave | Un administrador debe configurarla en `/admin/radio/studio/ajustes`. |
| Una pista no carga | Puede haberse borrado de AzuraCast; quítala de la cola. |

## 8. Límites conocidos

- La mezcla se hace en tu navegador: si tu equipo falla, se corta la transmisión.
- Quien escucha tiene unos 5 s de retraso respecto a lo que haces (buffers de AzuraCast y del reproductor).
- El estudio permite un DJ a la vez. Las voces de varios locutores remotos llegarán en una etapa posterior.
- La música que subas debe ser tuya o tener licencia para su difusión.
