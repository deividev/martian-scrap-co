# Estado del proyecto Martian Scrap Co.

**Revisión completa a fecha 2026-11-02.** Escrita en lenguaje sencillo para saber cómo está todo antes de hacer las pruebas. Los detalles técnicos están en el [plan de tareas](04-phased-agent-task-plan.md) y en la [lista de pendientes](pending-work.md). Este documento los resume; si algo no coincide, mandan esos dos.

## 1. Resumen en 30 segundos

- Hay un **patio de pruebas jugable en solitario**. Todavía no es el juego completo: es la primera "rebanada" del juego (fase 4 de 12).
- El ciclo básico **ya funciona entero**: aspirar chatarra → descargarla en la tolva → prensar una paca → venderla → comprar una mejora → descubrir la baliza de la estación.
- También hay menús con mando, guardado automático, sonidos provisionales y un registro automático para las pruebas.
- **Jugar en línea con otros todavía no se puede.** La parte técnica de Steam está hecha, pero falta probarla entre dos cuentas reales (tú y tu hermano), y para publicar falta un App ID propio.
- **Lo siguiente es tuyo:** hacer la prueba de juego con tu hermano y amigos (tarea MSC-039), con la [guía en español](playtests/MSC-039-guia-prueba.md).
- **Ojo: nada está subido a GitHub desde el 30 de octubre.** Hay 33 cambios guardados solo en tu PC (más abajo, sección 8).

## 2. Qué se puede jugar hoy

En el patio de pruebas puedes:

- **Moverte** en primera persona con teclado y ratón o con mando.
- **Aspirar chatarra pequeña** con el **Imán colector**. Al principio solo atrae la **Chatarra férrica** (piezas grises de hierro). Lo aspirado va al **Contenedor** (20 piezas).
- **Descargar en la Tolva de la base**, que separa la chatarra por material.
- Dejar que la **Compactadora** prense 10 piezas del mismo material y saque una **paca**.
- **Coger la paca, llevarla a la Máquina de venta** y ganar **Créditos del equipo** (40 C por paca de hierro).
- Abrir la **Tienda de mejoras** y comprar el **colector nivel 2** (80 C), que atrae más materiales.
- **Despejar la montaña** hasta descubrir la **baliza de la estación**: es el primer paso hacia el final del juego.
- Usar el **Cortador** en el rover, el **Carrito** y coger objetos medianos.
- Abrir el **Menú** (Esc o botón Menú) para cambiar el idioma (español/inglés) y los volúmenes.
- **Cerrar y volver a abrir**: la partida se guarda sola cada pocos segundos tras cada cambio.

Todo lo que ves (modelos, sonidos, precios, textos) es **provisional**.

## 3. Cómo va cada fase

| Fase | De qué trata | Estado |
|---|---|---|
| 1. Decisiones y base del proyecto (MSC-001 a 010) | Decisiones del juego, proyecto vacío, Electron seguro, empaquetado, comprobaciones | **Terminada** |
| 2. Simulación y manejo (MSC-011 a 020) | Física, controles, aspirar, contenedor, coger objetos, carrito, cortes, rendimiento | **Terminada** (aprobaste el manejo el 30/10) |
| 3. Cooperativo y Steam (MSC-021 a 030) | Reglas del juego en red, Steam, invitaciones, 4 jugadores, Steam Deck | **A medias.** 021–025 hechas; 026 **bloqueada** (ver sección 5); 027–030 sin empezar |
| 4. Primera rebanada jugable (MSC-031 a 040) | Tolva, compactadora, venta, tienda, ruta hasta la baliza, guardado, menús, sonido, prueba con jugadores, aprobación | **En curso.** 031–038 hechas pero pendientes de comprobar jugando; 039 es la prueba (tuya); 040 es tu aprobación |
| 5 a 12 | Arte y sonido definitivos, todas las herramientas, campaña, final en la estación, menús finales, endurecer guardado y red, optimizar, publicar | **Sin empezar** |

¿Por qué la fase 4 avanzó antes de terminar la 3? Lo pediste tú: avanzar en lo que se juega en solitario mientras esperamos la prueba de Steam con tu hermano. Por eso las tareas 031–038 están "en curso" y no "terminadas": les falta la mitad cooperativa y la comprobación jugando.

## 4. La fase actual, tarea a tarea

| Tarea | Qué hace | Qué falta |
|---|---|---|
| MSC-031 Tolva | Descarga todo el contenedor de una vez y lo separa por material | Probar que un invitado también puede descargar (necesita cooperativo) |
| MSC-032 Compactadora | Prensa 10 piezas en una paca; espera si la plataforma está ocupada | Probar qué pasa si alguien se desconecta a mitad (cooperativo) |
| MSC-033 Venta | Vende la paca y suma créditos al equipo | Probar con desconexiones (cooperativo) |
| MSC-034 Tienda | Comprar el colector nivel 2 con créditos compartidos | **Verlo jugando** (P-08); peticiones de compra de invitados (cooperativo) |
| MSC-035 Ruta | Guía hasta la baliza con el panel **Trabajo actual** y una flecha | **Verlo jugando** (P-10, P-11); ajustar posición y dificultad (P-12) |
| MSC-036 Guardado | Guardado seguro con copia de respaldo; aguanta cierres bruscos | **Cerrar y abrir tras jugar de verdad** (P-13) |
| MSC-037 Menús y mando | Menú de pausa y tienda usables con mando | **Ruta completa solo con mando real** (P-22) |
| MSC-038 Sonido | 11 sonidos provisionales y 3 volúmenes | **Escucharlos jugando** (P-27) |
| MSC-039 Prueba con jugadores | [Guía en español](playtests/MSC-039-guia-prueba.md), hoja de notas y registro automático | **Hacer la prueba** (P-32) |
| MSC-040 Aprobación | Decides si la rebanada está bien antes de pasar al arte definitivo | Depende de los resultados de la 039 |

## 5. Lo que está bloqueado y por qué

- **Steam entre dos cuentas (MSC-026).** El juego ya arranca Steam, crea una sala privada para amigos y la cierra bien. Lo probamos con el App ID de pruebas de Valve, el **480**, que solo vale en local y nunca se sube ni se publica. Falta:
  - **Tu prueba con tu hermano**, cada uno con su cuenta y en una red distinta, con `tools/dev-p2p/host.bat` y `join.bat` (P-01). Tras eso, ver que funciona la invitación desde Steam (P-03).
  - **Un App ID propio** de Steamworks (P-02), necesario para el juego de verdad.
  - Repetir la prueba rápida de Steam **con el cliente de Steam abierto** (P-21).
- **Steam Deck (MSC-030):** hace falta tener acceso a una Steam Deck (P-17, P-23).
- **Voz:** aplazada por decisión tuya (29/10). No hay chat de voz ni se promete.

## 6. Pendientes, explicados

La lista completa está en [pending-work.md](pending-work.md), con la columna **Do in**, que dice en qué tarea se resuelve cada uno. Aquí van agrupados.

### 6.1 Lo que tienes que hacer tú

| # | Qué | Cuándo |
|---|---|---|
| P-40 | **Subir el trabajo a GitHub** como copia de seguridad (sección 8) | Cuanto antes |
| P-34 | Abrir el juego nuevo con `playtest.bat` y ver **"Partida restaurada"** y el archivo en `Documentos\Martian Scrap Co playtest logs` | Antes de la prueba |
| P-32 | Hacer la **prueba con jugadores** con la guía | Cuando quedes |
| P-01, P-03 | Prueba de Steam con tu hermano (dos cuentas, dos redes) | Cuando podáis |
| P-21 | Prueba rápida de Steam con Steam abierto | Junto a la anterior |
| P-02 | Conseguir el **App ID propio** de Steamworks | Antes de MSC-027 |
| P-41 | Revisar los **pantallazos azules** del PC (análisis del volcado o test de memoria) | Antes de sesiones largas |
| P-12 | Decidir posición y dificultad de la baliza tras la prueba | En MSC-040 |
| P-16 | Decidir si se usa **Steam Cloud** | Más adelante (MSC-093) |
| P-17, P-23 | Probar en **Steam Deck** | Cuando haya acceso |
| P-39 | Mantener iguales la guía en español y el guion en inglés | Siempre que cambien |

### 6.2 Lo que se comprueba en la prueba con jugadores (MSC-039)

- **P-08:** comprar el colector nivel 2 jugando de verdad.
- **P-10:** descubrir la baliza tras la ruta completa.
- **P-11:** que un jugador nuevo sepa qué hacer después.
- **P-13:** cerrar y abrir sin perder nada.
- **P-22:** jugar todo solo con mando.
- **P-27:** escuchar los sonidos y decir si molestan.

En la prueba fíjate también en dos fallos ya conocidos:
- **P-37:** algunos textos dicen "clic izquierdo" aunque juegues con mando.
- **P-38:** la herramienta se llama a veces **Imán colector** y otras **colector**.

### 6.3 Cooperativo (cuando funcione Steam entre dos cuentas)

Todos esperan a la prueba con tu hermano. Son:
- P-04: unirse tarde, salir y volver, e invitaciones;
- P-05 a P-07: tolva, compactadora y venta con invitados;
- P-09 y P-25: el invitado pide una compra y el anfitrión la aprueba;
- P-15: un invitado nunca toca la partida del anfitrión;
- P-28: sonidos de 4 jugadores a la vez.

### 6.4 Mejoras para más adelante (ya tienen tarea asignada)

| # | Qué | Tarea |
|---|---|---|
| P-14 | Menú para empezar partida nueva o reiniciar | MSC-081 |
| P-18, P-35 | Al cerrar la ventana, esperar a que termine el último guardado y el registro | MSC-092 |
| P-19 | Guardar también cuando solo se mueve el carrito u objetos | MSC-079 |
| P-24 | Opciones de comodidad: sensibilidad, invertir, cambiar teclas | MSC-084 |
| P-26 | Tras cerrar el menú con Esc, el navegador pide un clic para volver a capturar el ratón | MSC-089 |
| P-29 | Sonido definitivo y música | MSC-047, MSC-078 |
| P-30 | Volumen con izquierda/derecha | MSC-084, MSC-088 |
| P-31 | Un error en consola al hacer clic sin foco | MSC-089 |
| P-37 | Textos de ayuda según se use mando o teclado | MSC-085 |
| P-38 | Un solo nombre para el colector | MSC-083, MSC-087 |

### 6.5 Antes de publicar (no afecta a las pruebas)

- **P-20 y P-33:** quitar las herramientas de desarrollo (prueba P2P y registro de pruebas) y no publicar los `.bat`.
- **P-36:** la carpeta antigua `Martian Scrap Co.` (con punto) se queda en tu PC; no molesta.

## 7. Antes de hacer las pruebas: lista rápida

1. **Sube el trabajo a GitHub** (P-40), o al menos dime que lo haga.
2. En la carpeta del proyecto, ejecuta `pnpm run package`.
3. Copia `tools\dev-playtest\playtest.bat` y `new-tester.bat` a `release\win-unpacked`.
4. Abre con `playtest.bat`. Comprueba que sale **"Partida restaurada"** y que aparece el archivo de registro en Documentos (P-34).
5. Imprime o copia la **hoja de notas** de la [guía](playtests/MSC-039-guia-prueba.md) (sección 9), una por jugador.
6. Entre jugador y jugador: cierra el juego y ejecuta `new-tester.bat J1`, `J2`…
7. Al final, pásame las hojas (vale una foto) y los archivos de registro.

## 8. Copias de seguridad y Git

Nada se sube a GitHub sin que tú lo pidas. Ahora mismo, comparado con GitHub:

- `develop` tiene **33 commits sin subir**: todo desde las fases 3 y 4 hasta la guía de pruebas.
- `phase/04-vertical-slice` tiene **22 commits sin subir**.
- `phase/03-coop-authority` **nunca se ha subido**. Su contenido ya está dentro de `develop`.
- `main` y las fases 1 y 2 están al día.

Con los pantallazos azules, un fallo del disco podría hacer perder ese trabajo. Por eso está como **P-40**. Cuando me lo pidas, lo subo.

## 9. Si Windows se vuelve a colgar

- El PC tiene pantallazos azules (código 0x50) desde el 6 de octubre. No los causa el proyecto: un programa normal no puede provocarlos. Los dispara un controlador o la memoria cuando hay mucha carga. El análisis está pendiente (P-41).
- **Yo ya no abro el juego empaquetado** desde mi consola: las dos veces que lo hice, Windows se colgó. Las pruebas con el juego abierto las haces tú.
- **Después de un cuelgue, pídeme que revise:**
  - que los ejecutables no hayan quedado cortados (ya pasó una vez con `electron.exe`; hoy están bien);
  - que la partida guardada se lee bien;
  - que el repositorio está limpio.

## 10. Qué viene después

1. Tú: subir a GitHub (P-40), la primera apertura (P-34) y la **prueba con jugadores** (MSC-039).
2. Yo: escribir los resultados, cerrar los pendientes que queden probados y arreglar lo que salga, por ejemplo P-37 y P-38.
3. Tú: **aprobar la rebanada** (MSC-040), o pedir cambios.
4. En paralelo, cuando podáis: la **prueba de Steam con tu hermano**. Eso desbloquea las fases 3 y el cooperativo de la 4.
5. Después: fase 5, la primera prueba de arte y sonido definitivos, que necesitará tu aprobación.
