# Steam Voice: guía paso a paso para integrar chat de voz

Guía independiente para implementar chat de voz en un juego de PC integrado con Steam, sin depender de un motor, repositorio o mecánica concreta. El objetivo es conseguir que los participantes puedan hablar y escucharse con controles de transmisión, volumen y silenciamiento.

Los nombres de módulos y el pseudocódigo son propuestas de organización; deben adaptarse al lenguaje y al motor elegidos. La proximidad, los equipos y cualquier interacción con la jugabilidad son extensiones que decide cada desarrollador.

## 1. Preparar Steamworks en el juego

Antes de añadir voz:

1. Configurar el App ID y la integración de Steamworks para el entorno de desarrollo.
2. Inicializar Steam mediante el SDK o el binding del motor.
3. Mantener activo el procesamiento de callbacks según las reglas de esa integración.
4. Comprobar que se puede obtener la identidad del usuario local.
5. Disponer de una sesión multijugador con participantes identificados y autorizados. Puede estar asociada a una sala de Steam o al sistema de sesiones del juego.
6. Definir qué mostrará la interfaz cuando Steam o la voz no estén disponibles.

Si el juego ya inicializa Steam, reutilizar ese cliente. Centralizar su ciclo de vida para que la voz no inicialice ni cierre Steam por su cuenta.

**Resultado esperado:** el juego conoce al usuario local, a los participantes de la sesión y cuándo alguien entra o sale.

## 2. Elegir cómo se distribuirá el audio

Separar tres responsabilidades:

| Parte | Responsabilidad |
| --- | --- |
| Captura y códec | Obtener voz comprimida y convertir la voz recibida en PCM. |
| Transporte | Enviar los bytes al destinatario correcto y verificar su origen. |
| Reproducción | Mantener una cola de audio por hablante y mezclarla con el sonido del juego. |

Steam Voice proporciona captura y descompresión. El juego debe conectar esas operaciones con su transporte y su sistema de reproducción. Referencia: [Steam Voice de Valve](https://partner.steamgames.com/doc/features/voice).

Elegir una topología según el tamaño y la arquitectura del juego:

| Opción | Funcionamiento | Aspecto a dimensionar |
| --- | --- | --- |
| Entre participantes | Cada emisor envía a sus destinatarios. | Conexiones y ancho de banda de cada jugador. |
| Con anfitrión | Los invitados envían al host, que reenvía a los demás. | Tráfico agregado y disponibilidad del host. |
| Con servidor | Un servidor autorizado distribuye los paquetes. | Capacidad, autenticación y coste del servidor. |

Para empezar puede usarse un anfitrión con reenvío de audio comprimido. El reenvío no necesita descomprimir ni volver a comprimir el audio. El host solo lo descomprime si también debe escucharlo.

```text
Micrófono del emisor
    → captura comprimida
    → transporte directo o reenvío
    → descompresión en el receptor
    → búfer de reproducción
    → mezcla de voz
    → salida de audio
```

**Resultado esperado:** saber quién recibe cada paquete y qué ocurre si se desconecta el anfitrión o el servidor.

## 3. Exponer las funciones necesarias del SDK

Comprobar que la integración utilizada expone estas operaciones de `ISteamUser`:

| Función | Uso |
| --- | --- |
| `StartVoiceRecording` | Iniciar la captura. |
| `GetAvailableVoice` | Consultar cuántos bytes comprimidos hay disponibles. |
| `GetVoice` | Extraer los bytes capturados. |
| `StopVoiceRecording` | Solicitar la parada. |
| `DecompressVoice` | Convertir los bytes recibidos en PCM mono de 16 bits. |
| `GetVoiceOptimalSampleRate` | Consultar la frecuencia propia del decodificador, si se necesita. |

`DecompressVoice` permite elegir una frecuencia de salida entre 11.025 y 48.000 Hz. Definir una frecuencia interna, por ejemplo 48.000 Hz, y adaptar la reproducción si el dispositivo funciona a otra. Consultar las firmas y los estados de retorno en [ISteamUser de Valve](https://partner.steamgames.com/doc/api/ISteamUser).

### Ampliar un binding mediante una extensión nativa local

Un binding es la capa que permite llamar al SDK nativo de Steamworks desde el lenguaje del juego. Puede ocurrir que el SDK incluya las funciones de voz, pero el binding todavía no las exponga. En ese caso, se puede ampliar su código fuente y compilar una versión propia.

La expresión «extensión local de un fork» describe esa organización: un fork es una copia del proyecto original mantenida con cambios propios, y la extensión local añade funciones sobre una revisión concreta de esa copia. Se puede partir del proyecto original o de un fork que ya aporte funciones necesarias para el juego. No es obligatorio crear un fork nuevo: también se pueden conservar el módulo añadido y un script que lo integre al reconstruir la dependencia.

Una carpeta `vendor` puede guardar ese código añadido y los binarios que utilizará el juego. El nombre de la carpeta es una convención del proyecto; lo importante es distinguir los archivos que se conservan de la copia temporal donde se compila. Una referencia a «MIT» identifica la licencia del código base correspondiente; registrar también las licencias y avisos de los componentes utilizados.

El procedimiento general es:

1. **Fijar la base.** Registrar el repositorio de origen y un commit exacto, además de las versiones del SDK, las dependencias y las herramientas de compilación. Conservar el archivo de bloqueo de dependencias para reconstruir la misma base.
2. **Añadir el módulo nativo.** Implementar las operaciones de captura y descompresión en el lenguaje del binding, y registrarlo entre sus módulos exportados. Si se necesita transporte de Steam que tampoco esté expuesto, añadir sus operaciones en esta capa. Usar las funciones de bajo nivel del SDK cuando el wrapper disponible no las incluya.
3. **Reutilizar el cliente existente.** Acceder al cliente que ya inicializa el juego, comprobar su disponibilidad y mantener su gestión de callbacks. La extensión no debe inicializar ni cerrar una segunda instancia por su cuenta.
4. **Definir el contrato con el juego.** Exponer métodos para iniciar y detener la captura, comprobar su parada completa, leer bytes comprimidos y descomprimirlos. Conservar los estados relevantes del SDK y establecer límites de tamaño y memoria. El transporte, si se incluye, debe entregar también la identidad verificada del origen.
5. **Compilar para el entorno de destino.** Generar el módulo para el sistema operativo, la arquitectura y el entorno de ejecución previstos. Por ejemplo, un binding de Node/Electron produce un módulo nativo que carga JavaScript; el código fuente añadido por sí solo no incorpora las funciones al paquete instalado.
6. **Automatizar la instalación y el empaquetado.** Preparar un script que obtenga la revisión fijada, aplique la extensión, compile y copie el módulo y las bibliotecas necesarias al lugar desde el que se cargarán. Evitar depender de cambios manuales dentro de una carpeta de dependencias que se reemplazará al reinstalar.
7. **Verificar la ampliación.** Comprobar que se exportan los métodos nuevos y que siguen disponibles las funciones anteriores del binding. Después, probar captura y reproducción reales con Steam inicializado; comprobar las exportaciones no demuestra que el micrófono funcione.

```text
Código fuente del binding en una revisión fijada
    + módulo local de voz
    → compilación nativa
    → módulo y bibliotecas del entorno de destino
    → carga desde el juego
    → llamadas al cliente Steam existente
```

### Conectar el binding con el servicio de voz

Construir encima una interfaz pequeña, por ejemplo:

```text
VoiceCapture.start()
VoiceCapture.requestStop()
VoiceCapture.poll() → estado y bytes comprimidos
VoiceCodec.decode(bytes, frecuencia) → PCM
VoiceTransport.send(destinatario, paquete)
VoiceTransport.receive() → paquetes y origen verificado
VoicePlayback.push(hablante, PCM)
VoicePlayback.clear(hablante)
```

Estos nombres pertenecen al adaptador del juego, no al SDK de Valve. El adaptador debe conservar los estados de retorno necesarios para distinguir ausencia de datos, captura terminada y error.

**Resultado esperado:** poder usar captura, transporte y reproducción sin repartir llamadas del SDK por toda la aplicación.

## 4. Crear una sesión de voz

Mantener un estado de voz asociado a la sesión multijugador:

- Identificador de sesión.
- Identidad local y participantes autorizados.
- Correspondencia entre identidades de red e IDs internos de jugador.
- Versión del protocolo de voz.
- Generación aleatoria de conexión y secuencias de paquetes.
- Estado de captura y colas de reproducción.

Actualizar la autorización cuando alguien entra o sale. Ser amigo de Steam o compartir App ID no constituye permiso para enviar voz a una partida.

Si existe un host que reenvía audio, debe asignar la identidad del hablante a partir del origen verificado por el transporte. Los clientes aceptan los paquetes reenviados únicamente desde ese host y dentro de la sesión vigente.

Usar un intercambio de control antes de aceptar audio. Una propuesta es:

```text
Invitado → HELLO(versión, sesión, generaciónLocal)
Host     → WELCOME(sesión, generaciónHost, generaciónLocal, idAsignado)
Invitado → AUDIO(sesión, generaciones, secuencia, vozComprimida)
```

Las generaciones distinguen conexiones sucesivas y evitan confundir audio viejo con una sesión nueva. No sustituyen la autenticación ni la autorización de participantes. Si cambia el host, renovar el estado y repetir la negociación antes de reanudar.

**Resultado esperado:** cada flujo de voz queda vinculado a un participante autorizado de la sesión actual.

## 5. Implementar captura y modos de micrófono

Ofrecer Pulsar para hablar y, si se desea, Siempre activo. Mantener separadas la preferencia del usuario y la autorización efectiva de transmisión.

```text
puedeTransmitir = servicioDisponible
                  y sesiónDeVozPreparada
                  y chatActivado
                  y estadoPermitidoPorElJuego

quiereTransmitir = modoSiempreActivo o acciónHablarMantenida

capturar = puedeTransmitir y quiereTransmitir
```

Definir explícitamente si se permite transmitir en menús, pausas, cambios de foco y otros estados. Una única función debe resolver esa política. Cambiar de modo no debe dejar una captura anterior abierta accidentalmente.

En cada actualización del servicio:

1. Si corresponde capturar y la captura está detenida, iniciarla.
2. Consultar los datos disponibles y extraer los bytes comprimidos.
3. Crear paquetes solamente si la transmisión continúa autorizada.
4. Si se retira el permiso, solicitar la parada y pasar al vaciado del paso siguiente.
5. Ante un fallo, cerrar la captura y mostrar un estado recuperable.

Consultar la captura periódicamente, por ejemplo cada 20 ms como punto inicial de ajuste. Ese intervalo no garantiza que cada lectura produzca exactamente 20 ms de audio. Evitar que el servicio dependa exclusivamente del renderizado: un menú o una ventana minimizada puede reducir o detener los fotogramas.

En aplicaciones con varios procesos, el proceso que posee Steam debe verificar el permiso de captura. Puede exigir una señal periódica del proceso del juego y detener el micrófono si deja de recibirla.

**Resultado esperado:** el micrófono transmite únicamente bajo las condiciones elegidas y el indicador refleja el estado real de captura.

## 6. Resolver la parada y la cola final

`StopVoiceRecording` puede dejar una cola breve. Se debe seguir llamando a `GetVoice` hasta recibir `k_EVoiceResultNotRecording`; una lectura sin datos no equivale necesariamente a una parada terminada.

Usar una máquina de estados:

```text
DETENIDO → CAPTURANDO → VACIANDO → DETENIDO
```

Al solicitar la parada:

1. Dejar de autorizar nuevos envíos cuando corresponda.
2. Llamar a `StopVoiceRecording`.
3. Seguir consumiendo la cola final hasta confirmar la parada.
4. Descartar siempre la cola si se desactivó el chat, se abandonó la sesión o se revocó la transmisión.
5. No iniciar una captura nueva hasta terminar el vaciado.

Para la liberación normal de Pulsar para hablar, decidir si se transmite la cola final para conservar el final de las palabras o si se descarta. Esa elección debe respetar la política de transmisión. Nunca enviar la cola antigua a una sesión o destinatario nuevos. El comportamiento de parada está descrito en [StopVoiceRecording de Valve](https://partner.steamgames.com/doc/api/ISteamUser#StopVoiceRecording).

**Resultado esperado:** no reaparece audio anterior al volver a hablar o entrar a otra partida.

## 7. Enviar audio binario con límites

El transporte debe conservar exactamente los bytes comprimidos. Separar lógicamente voz y mensajes de jugabilidad para poder aplicar presupuestos y prioridades diferentes.

Si se utiliza `ISteamNetworkingMessages`:

1. Reservar un canal disponible para voz; su número es una decisión del proyecto.
2. Autorizar las solicitudes de sesión solo para participantes válidos.
3. Enviar el control de conexión de forma fiable.
4. Enviar audio con una política de baja latencia y sin retransmitir fragmentos que ya resulten obsoletos.
5. Recibir lotes acotados y liberar los mensajes según el contrato del SDK o del binding.
6. Cerrar las sesiones que ya no estén autorizadas.

La recepción nativa requiere liberar los objetos de mensaje después de utilizarlos. Referencia: [ISteamNetworkingMessages de Valve](https://partner.steamgames.com/doc/api/ISteamNetworkingMessages).

Diseñar un encabezado que incluya versión, tipo, sesión, generación de conexión, secuencia y longitud del contenido. Añadir identidad de hablante cuando exista reenvío, asignada por la autoridad que verifica al emisor.

Antes de descomprimir, comprobar:

- Origen y destinatario autorizados.
- Versión, sesión y generación vigentes.
- Longitud del encabezado y del contenido.
- Secuencia aceptable, tratando duplicados y desbordamientos del contador.
- Presupuesto de paquetes y bytes por intervalo.
- Capacidad disponible en las colas.

Dimensionar los límites para el máximo de hablantes simultáneos. Con reenvío, un receptor recibe varios flujos desde un único host: el presupuesto debe contemplar ese tráfico agregado.

Si un bloque supera el tamaño elegido, descartar y recuperar el flujo o implementar fragmentación y reconstrucción acotadas. No dividir bytes y tratar cada fragmento como si fuera un bloque comprimido independiente.

**Resultado esperado:** pérdida, paquetes inválidos o ráfagas no provocan colas sin límite ni bloquean el resto del juego.

## 8. Descomprimir y reproducir por hablante

Para cada paquete aceptado:

1. Comprobar si corresponde escucharlo según silenciamientos y permisos.
2. Pasar el bloque comprimido completo a `DecompressVoice`.
3. Validar el estado de retorno y la cantidad de PCM generado.
4. Si falta espacio, ampliar el búfer solo hasta el máximo configurado o descartar el bloque.
5. Añadir el PCM a la cola del hablante correspondiente.
6. Consumir esa cola desde el sistema de audio del motor.

Usar una cola o búfer circular independiente por hablante. Reservar memoria de antemano cuando sea posible y evitar asignaciones o esperas bloqueantes dentro del callback de audio.

Introducir un pequeño búfer inicial para absorber variaciones de llegada. Por ejemplo, 60 ms puede servir como punto inicial; ajustar mediante mediciones de latencia y cortes. Si falta audio, reproducir silencio o aplicar la recuperación del motor. Si sobra demasiado, recuperar actualidad descartando audio antiguo según una política definida.

La frecuencia de reproducción debe coincidir con la del PCM o incluir remuestreo. Como referencia de dimensionamiento:

```text
bytesPCM = frecuencia × canales × bytesPorMuestra × segundos

PCM mono de 16 bits a 48.000 Hz durante 0,5 s:
48.000 × 1 × 2 × 0,5 = 48.000 bytes
```

Crear un bus de mezcla dedicado:

```text
Cola del hablante → volumen individual → volumen de voz → volumen general
```

En Electron, la captura y la red pueden residir en el proceso principal y la reproducción en un `AudioWorklet`, usando IPC limitado. En un motor nativo se conectan los bloques PCM a su sistema de audio. La arquitectura conserva las mismas responsabilidades.

**Resultado esperado:** conversación continua, volumen independiente y latencia acotada por hablante.

## 9. Añadir controles y preferencias

La interfaz básica debe permitir:

- Activar o desactivar el servicio de voz.
- Elegir modo de micrófono.
- Reasignar Hablar en teclado y mando si esos dispositivos están soportados.
- Ajustar volumen general de voz y volumen por participante.
- Silenciar participantes.
- Ver si el servicio está disponible y si se está transmitiendo.

Distinguir captura local de audio enviado y recibido en los diagnósticos. Si se muestra quién está hablando, actualizar ese indicador con audio reciente y dejarlo caducar; no debe quedar encendido después de una desconexión.

Guardar solo las preferencias que tenga sentido conservar. Definir aparte si el silenciamiento y el volumen individual duran una sesión o se recuerdan por identidad de usuario. No mezclar audio, secuencias o generaciones de conexión con las partidas guardadas.

**Resultado esperado:** el usuario puede controlar su transmisión y su escucha sin depender de herramientas de desarrollo.

## 10. Limpiar el estado y permitir la recuperación

Al abandonar una sesión, desactivar el servicio o cerrar el juego:

1. Revocar el permiso de transmisión.
2. Solicitar la parada y gestionar la cola final mientras Steam siga disponible.
3. Retirar destinatarios y cerrar conexiones de voz que ya no se utilicen.
4. Vaciar colas y liberar reproductores.
5. Cancelar tareas y eventos pendientes.
6. Invalidar la generación local para descartar respuestas asíncronas antiguas.
7. Eliminar indicadores y estado temporal de la sesión.

La parada debe poder llamarse más de una vez sin fallar. La reconexión crea una generación nueva y repite la autorización. Tratar ausencia de micrófono, cambios de dispositivo y pérdida de servicio como estados recuperables, sin detener la partida completa.

**Resultado esperado:** entrar y salir repetidamente no deja el micrófono abierto, audio residual ni recursos acumulados.

## 11. Aplicar reglas de escucha solo si el diseño las requiere

Con la conversación básica funcionando, el desarrollador puede elegir escucha global, por equipos, por canales o por proximidad. Cada regla decide destinatarios, mezcla o ambos.

Para escucha global basta la mezcla básica. Para proximidad se puede añadir posición y atenuación espacial. Esas extensiones deben quedar separadas de captura, códec y sesión, de modo que puedan cambiar sin reconstruir todo el servicio de voz.

Si una regla debe impedir que un participante reciba una conversación, aplicarla también al enrutamiento; bajar su volumen local no evita que reciba los datos.

**Resultado esperado:** las reglas propias de cada juego se añaden sobre un servicio de voz ya funcional.

## 12. Validar y preparar la distribución

Validar por etapas:

| Prueba | Qué debe demostrar |
| --- | --- |
| Dos participantes reales | Captura, envío, descompresión y escucha en ambos sentidos. |
| Varios hablantes | Mezcla y presupuestos con la concurrencia máxima prevista. |
| Modos y controles | Pulsar para hablar, Siempre activo y cambios de configuración. |
| Parada y reconexión | Cola final controlada y ausencia de audio de sesiones anteriores. |
| Red adversa | Recuperación ante pérdida, retraso, duplicados y ráfagas. |
| Dispositivos | Micrófonos y salidas distintas, ausencia y cambios de dispositivo. |
| Ciclo de aplicación | Menús, foco, suspensión y cierre según la política elegida. |
| Plataformas | Cada arquitectura y sistema operativo que se distribuya. |
| Rendimiento | Coste de captura, códec, red, copias y reproducción durante el juego. |

Combinar simulaciones con pruebas reales. Inyectar PCM sirve para comprobar la reproducción, pero no valida el micrófono, el códec ni el transporte completo.

Registrar latencia de extremo a extremo, cortes de audio, crecimiento de memoria, ancho de banda y tiempos de fotograma. Medir durante las escenas más exigentes y con el máximo de participantes esperado; fijar el objetivo de rendimiento para cada juego.

Antes de distribuir, verificar que cada ejecutable incluye las bibliotecas y extensiones necesarias, que el servicio informa correctamente de su disponibilidad y que las versiones incompatibles del protocolo se rechazan de forma controlada.

**Resultado esperado:** el chat funciona en el ejecutable final y en los dispositivos previstos, con resultados medidos y pendientes identificados.
