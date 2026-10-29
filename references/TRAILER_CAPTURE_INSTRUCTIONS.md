# HeadArrow — instrucciones para la IA que grabará material para un trailer

Entrega este documento a la IA que tenga acceso al proyecto y pueda ejecutar y
grabar el juego. Su tarea es preparar **vídeos fuente para montaje**, con una
descripción de cada archivo, y entregarlos en un ZIP.

## Objetivo

Graba material real del juego que permita entender qué se hace, qué lo distingue
y qué momentos pueden despertar más interés en un trailer. Antes de grabar,
identifica sus mecánicas principales, escenarios, momentos visuales y recursos
de cámara disponibles. No inventes características ni escenas que no existan.

## Cantidad y prioridad

- Prepara **aproximadamente 20–30 vídeos útiles y variados** para poder elegir
  el mejor material durante el montaje. No es necesario usar todos en el trailer.
- Asigna a cada vídeo una **prioridad numérica de selección**, desde **1 (el más
  importante)** hasta el total de vídeos entregados, sin repetir posiciones.
- Prioriza los momentos que mejor explican el juego, sus mecánicas distintivas y
  las escenas más llamativas o con mayor potencial para un trailer. Justifica
  brevemente la prioridad de cada toma.
- En `LEEME.md`, presenta la lista completa ordenada por prioridad y destaca
  además un **top 5 de tomas imprescindibles**, explicando por qué las elegirías.
  La prioridad indica qué material conviene seleccionar; no impone el orden del montaje.
- Evita rellenar la entrega con duplicados para llegar a la cantidad. Si el juego
  no permite reunir 20 tomas distintas y útiles, explica la limitación.

## Qué mostrar

1. **Preferiblemente sin HUD.** Desactiva interfaz, cursor y ayudas de depuración
   mediante las opciones o herramientas de captura del juego. No es obligatorio:
   conserva el HUD cuando sea necesario para entender una mecánica y anótalo.
2. **Jugabilidad y cinemáticas.** Incluye acciones jugables reales y secuencias
   cinematográficas existentes. También sirven vistas del entorno grabadas dentro
   del juego. Si el juego no tiene cinemáticas, indícalo y usa esos planos de ambiente;
   no inventes una cinemática ni una función para cumplir una cuota.
3. **Variedad.** Muestra diferentes mecánicas, escenarios y aspectos del juego:
   interacción, progresión, exploración, combate, construcción, personajes,
   habilidades o cualquier otra faceta que realmente tenga. Evita entregar muchas
   variantes del mismo gesto dejando fuera otras partes importantes.
4. **Los momentos más relevantes y con potencial para un trailer.** Prioriza
   aquello que se entiende rápido, distingue al juego y puede generar conversación:
   una habilidad vistosa, una transformación, una situación inesperada, una
   interacción curiosa, una amenaza o una recompensa satisfactoria. Elige ejemplos
   propios del juego y muestra su resultado, no solo la preparación.

## Cómo grabar las acciones

- Graba cada acción como una toma continua: preparación breve, ejecución y resultado.
  No cortes mientras está sucediendo lo importante.
- Deja alrededor de 0,3–0,5 segundos de margen antes y después cuando resulte útil
  para montar. Evita segundos innecesarios sin actividad al principio o al final.
- Como orientación, las tomas pueden durar 5–12 segundos, pero **la acción manda**:
  permite más tiempo si lo necesita, en lugar de interrumpirla.
- Si una mecánica necesita dos puntos de vista, graba dos tomas independientes y
  explícalo. No fragmentes una misma acción en cortes arbitrarios.
- Graba el sonido original del juego: efectos, ambiente y voces cuando correspondan.
  Si es posible, desactiva solo la música interna para que no compita con la canción
  del montaje. Si no se puede separar, indícalo. No silencies todos los efectos.

## Cámara suave y natural

- No hagas giros bruscos, saltos de orientación, teletransportes de cámara ni
  alternancias erráticas de dirección. No sacudas el ratón para buscar el objetivo.
- Prepara el encuadre antes de actuar. Gira y desplázate con aceleración y frenado
  suaves; mantén velocidades moderadas y deja tiempo para entender la escena.
- En primera o tercera persona, sigue la acción sin corregir la cámara constantemente.
  En planos cinematográficos, usa recorridos cortos, claros y con un punto de interés.
- Busca un comportamiento humano: pequeñas correcciones de encuadre y variaciones
  naturales de velocidad. Una ligera imprecisión es aceptable; **no añadas temblores,
  errores artificiales o ruido aleatorio** para simular naturalidad.
- Evita movimientos perfectamente repetidos o un seguimiento rígido que parezca
  automatizado. También evita paneos continuos sin propósito.
- Si una toma queda errática, desorienta o pierde la acción, vuelve a grabarla.

## Formato y revisión

- Captura preferentemente en **1920×1080 a 60 fps**, en MP4/H.264 con audio estéreo.
  Si el entorno no permite esa captura, entrega la mejor fuente nativa disponible
  y documenta su resolución y FPS; no presentes una conversión como captura nativa.
- No añadas canción, rótulos, subtítulos de marketing, transiciones, logos ni pantallas
  de wishlist. HeadArrow se encarga de la música y del cierre durante el montaje.
- Revisa cada vídeo reproducido antes de entregarlo: acción completa, cámara suave,
  imagen legible, sonido presente y ausencia de ventanas del editor o depuración.
- Si no tienes herramientas para ejecutar o grabar el juego, informa de la limitación.
  No entregues rutas inexistentes ni afirmes haber grabado material que no existe.

## ZIP final y descripción de cada vídeo

Entrega un archivo llamado `NombreDelJuego_Trailer_Source.zip`, con esta estructura:

```text
NombreDelJuego_Trailer_Source.zip
├── clips/
│   ├── 01_mecanica_principal.mp4
│   ├── 02_escenario_o_cinematica.mp4
│   └── 03_momento_destacado.mp4
├── assets/
│   ├── logo.png
│   └── background.jpg
└── LEEME.md
```

Usa nombres numerados y descriptivos. Incluye el logo original con transparencia y
un fondo del juego sin texto, si están disponibles; si falta alguno, indícalo.
Los nombres del ejemplo son orientativos: el ZIP debe contener aproximadamente
20–30 tomas útiles, con variedad y sin duplicados innecesarios.

En `LEEME.md` indica el nombre del juego, versión o build, configuración de captura
y cualquier limitación. Añade **una fila por cada vídeo real**, con:

| Prioridad | Archivo | Qué sucede y qué muestra | Motivo de prioridad | Tipo | Duración / resolución / FPS | HUD y audio | Inicio y fin útiles | Observaciones |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (la más importante) | `clips/01_....mp4` | Descripción concreta de la acción y su resultado | Qué aporta y por qué conviene seleccionarla | Gameplay, cinemática o ambiente | Valores reales | Si hay HUD, efectos y música interna | Segundos de la acción completa | Cámara o incidencias |

Destaca las tomas que consideres más potentes para abrir el trailer y explica por
qué. Comprueba que el ZIP se abre, que contiene todos los archivos descritos y que
los vídeos se reproducen. **Entrega la ruta o enlace del ZIP junto con un resumen
de lo que hace cada vídeo.**
