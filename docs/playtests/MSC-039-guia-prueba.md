# Prueba de juego MSC-039: guía para jugar y apuntar

Esta es la versión en español para usar durante la prueba. Está escrita para cualquier jugador. Los nombres en **negrita** son los mismos que aparecen en el juego con el idioma en español. El [guion técnico en inglés](MSC-039-slice-playtest-script.md) dice lo mismo para el proyecto; si alguna vez no coinciden, avisa.

## 1. Para qué es esta prueba

Queremos ver cómo juega por primera vez alguien que no conoce el juego:

- qué entiende sin ayuda;
- dónde se atasca;
- qué le aburre;
- qué le gusta.

No se examina al jugador, se examina el juego. Si alguien se pierde, **es culpa del juego** y es justo lo que buscamos.

**Se puede probar ya:**
- La primera media hora jugando solo: aspirar chatarra, descargarla, prensar pacas, venderlas, comprar una mejora, descubrir la baliza, usar el cortador y el carrito.
- Jugar entero con mando.
- Cerrar el juego y volver a abrirlo sin perder nada.
- Jugar con el sonido apagado.

**Todavía no se puede probar:** jugar juntos en línea. El juego aún no conecta a varios jugadores. Esa parte se apunta como **"no probado"**, nunca como "aprobado".

## 2. Antes de empezar (lo prepara David)

1. **Crear el juego:** en la carpeta del proyecto, ejecuta `pnpm run package`. El juego queda en `release\win-unpacked`.
2. **Copiar dos archivos** junto a `Martian Scrap Co.exe`, dentro de esa carpeta:
   - `tools\dev-playtest\playtest.bat` → abre el juego **apuntando datos automáticamente**.
   - `tools\dev-playtest\new-tester.bat` → deja la partida lista para el siguiente jugador.

   **No copies** `host.bat` ni `join.bat`: son de otra prueba.
3. **Abrir siempre con `playtest.bat`** (doble clic), no con el `.exe`. Así el juego guarda solo un archivo de notas en `Documentos\Martian Scrap Co playtest logs`. El archivo apunta:
   - la hora de cada momento clave (sección 6);
   - cada **Trabajo actual** que aparece y cuánto duró, y un aviso si alguien pasa 3 minutos en el mismo;
   - las ventas, las compras, las compras fallidas y los avisos de error;
   - cuándo se abre el menú, si se usa mando o teclado, y los cambios de volumen.

   El archivo no sale de tu PC.
4. **La primera vez** que abras esta versión, comprueba dos cosas:
   - tu partida anterior sigue ahí: al empezar sale el aviso **"Partida restaurada"**;
   - aparece un archivo en `Documentos\Martian Scrap Co playtest logs`.

   (Es el pendiente P-34.)
5. **Partida nueva para cada jugador:** al terminar un jugador, cierra el juego y ejecuta `new-tester.bat J1` (J1, J2, J3… según el jugador que acaba de jugar). Su partida se guarda aparte y el siguiente empieza de cero.
6. **Antes de cada jugador:**
   - deja el volumen como viene;
   - pon el idioma que prefiera, con la tecla **L** o en el **Menú**;
   - si va a jugar con mando, conéctalo antes de abrir el juego.
7. **Privacidad:**
   - en las notas, nadie tiene nombre: usa J1, J2, J3…;
   - grabar la pantalla solo si esa persona dice que sí;
   - **no grabes voces** de nadie sin su permiso.
8. **Material:** esta guía, una **hoja de notas** por jugador (sección 9) y un reloj o el móvil.

## 3. Quién hace qué

- **Quien juega:** juega como quiera y **dice en voz alta** lo que piensa, lo que intenta y lo que le sorprende.
- **Quien apunta** (por ejemplo, tu hermano): anota solo lo que el juego no puede ver:
  - lo que dice el jugador, con sus palabras;
  - cada vez que se le ayuda (sección 4);
  - cuándo se lía, se aburre o algo falla;
  - las respuestas a las preguntas.

  Las horas de los momentos clave ya las apunta el juego; en papel son opcionales.
- **Quien dirige** (David): lee la presentación, mira el reloj y solo ayuda siguiendo la sección 4.

**Ojo:** David ya conoce el juego. Cuando juega David, su partida **no cuenta** para ver si un jugador nuevo lo entiende. Sí sirve para:
- jugar entero con mando;
- cerrar y volver a abrir;
- probar los sonidos.

## 4. Reglas mientras se juega

- **No expliques nada** que no esté en la presentación. Si el jugador pregunta, responde: *"¿Tú qué crees que deberías probar?"*, y apunta la pregunta.
- **Escalera de ayuda.** Solo si lleva **3 minutos atascado** en lo mismo. Sube un escalón cada vez y apunta cuál y a qué hora:
  1. *"Mira los paneles de la pantalla."*
  2. *"Lee en voz alta el panel **Trabajo actual**."*
  3. Señala el sitio en la pantalla (la **tolva de la base**, la **compactadora**, la **máquina de venta**…), sin tocar los controles.
  4. Explica exactamente qué hacer. **Esto cuenta como fallo del juego** en ese paso.
- **Nunca cojas los controles** mientras juega.
- Apunta **lo que pasa**, no lo que crees que piensa. Si puedes, copia sus palabras tal cual.

## 5. Qué hay en pantalla: los nombres del juego

| Nombre en el juego | Qué es |
|---|---|
| **Créditos del equipo** (arriba a la izquierda) | El dinero, compartido por todo el equipo. Se gana vendiendo pacas. |
| **Trabajo actual** | Panel que dice qué hacer ahora. Es la pista principal del juego. |
| **Consejo:** … (arriba, en el centro) | Ayudas cortas sobre controles y herramientas. |
| **Imán colector · Nv1** (abajo a la derecha) | La herramienta que aspira chatarra pequeña. **Filtro:** dice qué material atrae. Al principio solo atrae **Chatarra férrica** (las piezas grises de hierro, símbolo **Fe**). |
| **Contenedor** (abajo a la izquierda, por ejemplo **0 / 20**) | Lo que llevas aspirado. Cuando se llena pone **LLENO**. |
| **Tolva de la base** | Donde se descarga el contenedor. Separa la chatarra por material. Su panel dice también qué hace la **compactadora**. |
| **Compactadora** | Prensa 10 piezas del mismo material y saca una **paca** a su plataforma. Su luz cambia de color mientras prensa. |
| **Paca** | Bloque de chatarra prensada. Se coge con clic izquierdo (RT) y se lleva a vender. |
| **Máquina de venta** | Vende la paca que llevas. Sin paca, abre la **Tienda de mejoras**. |
| **Tienda de mejoras** | Compra el **colector nivel 2**, que atrae más materiales. Cuesta **80 C**, es decir, dos pacas de hierro. Si no llega el dinero, sale **"Faltan créditos"**. |
| **Baliza de la estación** (flecha naranja al pie de la montaña) | Hay que quitar la chatarra que la tapa. Al descubrirla sale **"¡Baliza de la estación al descubierto!"**. |
| **Cortador** (tecla 2, o cruceta abajo) | Corta piezas grandes, como el **rover**, por sus **anillos naranjas**. |
| **Carrito** | Sirve para cargar objetos medianos y empujarlos. |
| **Tripulación** (arriba a la derecha) | Los robots del equipo. Hoy solo juega uno. |
| **Menú** (Esc, o botón Menú del mando) | Pausa con **Continuar**, el idioma y tres volúmenes: **Volumen general**, **Volumen de efectos** y **Volumen de interfaz**. |

**Controles básicos** (también salen abajo, en la pantalla):

| Acción | Teclado y ratón | Mando |
|---|---|---|
| Moverse / mirar | WASD / ratón | Stick izquierdo / stick derecho |
| Aspirar, cortar, coger o usar | Mantener clic izquierdo o **E** | Mantener **RT** o **X** |
| Descargar en la tolva | Clic derecho o **F** | **Y** |
| Cambiar herramienta | **1** colector / **2** cortador | Cruceta abajo |
| Cambiar material del filtro | Rueda del ratón | Cruceta izquierda / derecha |
| Saltar | Espacio | **A** |
| Menú | **Esc** | Botón Menú |
| En los menús | W/S o flechas para elegir, E o Intro para aceptar, Esc para volver | Cruceta para elegir, **A** para aceptar, **B** para volver |

## 6. La prueba, paso a paso (unos 40 minutos por jugador)

### 6.1 Presentación (2 minutos)

Léela en voz alta tal cual, sin añadir nada:

> "Esto es una prueba temprana de un juego de reciclar chatarra en Marte. Nada es definitivo: el arte, los sonidos, los precios y los textos van a cambiar. Probamos el juego, no a ti; si algo confunde, es culpa del juego y es justo lo que queremos encontrar. Di en voz alta lo que piensas, lo que intentas y lo que te sorprende. Casi no te voy a ayudar, a propósito. Juega como quieras; puedes parar cuando quieras."

Pregúntale si prefiere teclado o mando. **Al menos una persona** tiene que jugar la prueba entera **solo con mando**, sin tocar ratón ni teclado. Si nadie lo hace, lo hace David al final (6.5).

### 6.2 Juego libre, sin ayudar (hasta 25 minutos)

Pon el reloj cuando aparezca el escenario. El juego apunta solo la hora de estos momentos. Si quieres, apúntala también en la hoja:

| Nº | Momento | Cómo se nota en el juego |
|---|---|---|
| M1 | Aspira la primera pieza | El **Contenedor** sube de 0 |
| M2 | Descarga por primera vez | Sale **"Descargadas … piezas en la tolva"** |
| M3 | La compactadora empieza a prensar | **"Compactadora: prensando una paca…"** |
| M4 | Coge la primera paca | El **Trabajo actual** pasa a **"Lleva la paca a la máquina de venta…"** |
| M5 | Primera venta | **"Vendida …: +40 C para el equipo"** y suben los **Créditos del equipo** |
| M6 | Abre la tienda | Aparece la **Tienda de mejoras** |
| M7 | Ve el aviso de dinero insuficiente (si pasa) | **"Faltan créditos: hacen falta 80 C…"** |
| M8 | Compra el colector nivel 2 | El panel pasa a **Imán colector · Nv2** |
| M9 | Descubre la baliza | **"¡Baliza de la estación al descubierto!"** |
| M10 | Usa el cortador en el rover | **"Cortando …"** sobre los anillos naranjas |
| M11 | Usa el carrito | Carga algo en el **carrito** o lo empuja |
| M12 | Abre el menú de pausa | Aparece el **Menú** |

Apunta también, con la hora:
- **Se lía:** pregunta qué hacer o dice que no sabe seguir. Copia lo que dice.
- **Se aburre:** repite lo mismo muchas veces sin avanzar, o dice que es pesado.
- **Fallo:** algo se queda atascado, el carrito, piezas que atraviesan el suelo o vuelan, textos raros…
- **Sonidos:** si alguno le ayuda, le confunde o le molesta.

### 6.3 Pregunta "¿qué haces ahora?" (a los 5, 10 y 20 minutos)

En un momento tranquilo pregunta: *"¿Qué estás intentando hacer ahora y qué cambiará cuando lo hagas?"*. Apunta la respuesta con sus palabras y marca si **coincide** con lo que dice el **Trabajo actual**. Por ejemplo: "descargar en la tolva para llenar la paca", o "llevar la paca a la máquina para ganar créditos".

### 6.4 Tres minutos sin sonido

Hacia el minuto 20, abre el **Menú** y pulsa **Volumen general** hasta que ponga **silenciado**. Deja jugar 3 minutos y pregunta: *"¿Te has perdido algo sin sonido?"*. Apunta la respuesta. Después vuelve a ponerlo al 80 %.

### 6.5 Cerrar y volver a abrir

Al final, o en el minuto 25:
1. Pide que cierre la ventana del juego de forma normal.
2. Espera 5 segundos y vuelve a abrir con `playtest.bat`.
3. Debe salir **"Partida restaurada"**.
4. Comprueba que siguen igual:
   - los **Créditos del equipo**;
   - el nivel del colector;
   - el **Contenedor**;
   - lo que había en la **tolva**;
   - las pacas;
   - las piezas cortadas del rover;
   - la baliza.

El juego guarda unos segundos después de cada cambio, así que lo del último segundo puede faltar. Si falta algo, apúntalo.

**Prueba solo con mando** (si jugó con mando, o David al final), sin tocar ratón ni teclado:
1. aspirar;
2. descargar;
3. esperar a la compactadora;
4. coger la paca;
5. venderla;
6. abrir la tienda;
7. ver "Faltan créditos" o comprar;
8. abrir el **Menú**;
9. **Volver**.

Apunta si en algún paso hizo falta el ratón o el teclado, o si no se veía qué opción estaba elegida (la marcada en naranja con ▶).

### 6.6 Entrevista corta (5 minutos)

Apunta las respuestas con sus palabras:
1. ¿De qué va el juego, en una frase?
2. ¿Qué es lo que más te ha gustado? ¿Y lo que más te ha molestado?
3. ¿Hubo algo en pantalla que no entendieras (textos, iconos, paneles)?
4. ¿Los sonidos te ayudaron, o alguno te molestó?
5. ¿Seguirías jugando? ¿Qué harías ahora?
6. Si jugaras con amigos, ¿qué te gustaría hacer juntos?

## 7. Opcional: partida en grupo (no cuenta como prueba en línea)

Con 2 a 4 personas y un solo PC: uno juega y los demás miran y opinan. Cambiad de jugador cada 5 a 7 minutos, con la misma partida. Apunta:
- qué proponen los que miran;
- si se reparten tareas solos ("tú aspiras, yo vendo");
- si alguien cree que una tarea **necesita** a dos personas (no debería).

Sirve para ideas, pero la prueba real de jugar juntos sigue pendiente (P-04).

## 8. Al terminar

1. Cierra el juego y ejecuta `new-tester.bat J#` antes del siguiente jugador.
2. Suma en la hoja cuántos momentos clave alcanzó, cuántas ayudas hicieron falta, cuántas veces se lió, se aburrió o hubo fallos.
3. Pásame las hojas (una foto vale) y los archivos de `Documentos\Martian Scrap Co playtest logs`, diciendo qué archivo es de cada jugador. Yo escribo los resultados en el proyecto, cierro los pendientes que queden probados y apunto cada problema nuevo.

**Cómo se interpreta:**
- **Va bien** si:
  - los jugadores llegan de M1 a M5 sin el escalón 4 de ayuda;
  - las respuestas de "¿qué haces ahora?" suelen coincidir con el juego;
  - nada necesita a dos personas;
  - sin sonido no se pierde nada importante;
  - al reabrir sigue todo.
- **Siempre se apunta todo**, aunque sea pequeño. Que un jugador nuevo necesite ayuda es algo que hay que arreglar en el juego, no un mal jugador.
- **Jugar juntos en línea:** se apunta "no probado: falta la conexión entre jugadores (P-04)".

## 9. Hoja de notas (una por jugador)

```text
Jugador: J__   Fecha: ______   Juega con: teclado y ratón / mando   Idioma: ES / EN   PC: el de David / el suyo
¿Juega a videojuegos? nada / a veces / mucho      ¿Ha jugado juegos en primera persona? Sí / No

MOMENTOS CLAVE (minuto:segundo; opcional, el juego ya los apunta)
M1 aspira ____   M2 descarga ____   M3 prensa ____     M4 coge paca ____    M5 vende ____     M6 tienda ____
M7 faltan créditos ____   M8 colector Nv2 ____   M9 baliza ____   M10 cortador ____   M11 carrito ____   M12 menú ____

AYUDAS (escalón 1-4 + minuto + sobre qué)
_____________________________________________________________________________________________
_____________________________________________________________________________________________

"¿QUÉ HACES AHORA?"   min 5: __________________________________________  ¿coincide? Sí / No
                      min 10: _________________________________________  ¿coincide? Sí / No
                      min 20: _________________________________________  ¿coincide? Sí / No

SE LÍA (minuto + lo que dice)        SE ABURRE (minuto + qué)              FALLOS (minuto + qué pasó)
___________________________          ___________________________          ___________________________
___________________________          ___________________________          ___________________________

SONIDOS: ayudan ___________________  confunden ___________________  molestan ___________________
3 MIN SIN SONIDO: ¿se perdió algo? ____________________________________________________________

AL REABRIR: "Partida restaurada" [ ]  créditos [ ]  nivel [ ]  contenedor [ ]  tolva [ ]  pacas [ ]  rover [ ]  baliza [ ]
            falta: ____________________________________________________________________________
SOLO CON MANDO: hecho Sí / No   necesitó ratón/teclado en: ______________   no se veía la opción elegida en: ______________

ENTREVISTA: 1 ____________________________________  2 ____________________________________
            3 ____________________________________  4 ____________________________________
            5 ____________________________________  6 ____________________________________
```
