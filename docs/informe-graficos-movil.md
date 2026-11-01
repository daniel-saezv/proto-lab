# Informe: más detalle gráfico en móvil sin perder rendimiento

Fecha de la medición: 1 de noviembre de 2026. El laboratorio sigue modelado con primitivas de Three.js (cajas, esferas, cilindros, planos) y colores planos. En un iPhone la palanca que sube la calidad percibida, sin un pase extra de GPU, es el detalle de cada objeto y un sombreado que ya quepa en el fragmento que el móvil paga hoy.

Este documento no cambia la app. Los lotes de más abajo son trabajo para otros agentes y se quedan en `apps/world/src`. No tocan diálogos, audio, etiquetas ni `.github/`.

## 1. Estado actual

### 1.1 Renderer y detección de calidad

Todo el arranque gráfico está en `startWorld` (`apps/world/src/world.ts`).

El único interruptor de calidad es la media query `(pointer: coarse)`. No hay prueba de GPU, de memoria ni de Safari. Un iPhone en la PWA cae en ese modo. Un escritorio con ratón, no.

| Ajuste | Puntero fino (escritorio) | Puntero grueso (móvil) | `?e2e=1` |
| --- | --- | --- | --- |
| Antialias (MSAA del canvas) | sí | no | no |
| `powerPreference` | `default` | `low-power` | el del puntero |
| `pixelRatio` | `min(devicePixelRatio, 2)` | `min(devicePixelRatio, 1.5)` | 1 |
| `shadowMap` | sí | no | no |
| Mapa de la direccional | 1024², caja de −12 a 12, near 1, far 28 | no se usa | no se usa |

El color de salida es `SRGBColorSpace`. El tone mapping es `ACESFilmicToneMapping` con exposición `1.2`. La cámara de seguimiento usa fov 58 y brazo 3.8 cuando el aspecto es al menos 0.9, y fov 78 con brazo 6.4 en retrato. El plano cercano es `CAMERA_NEAR` (0.05) y el lejano 80 (`apps/world/src/navigation.ts`, `apps/world/src/world.ts`).

`prefers-reduced-motion: reduce` no baja la resolución: apaga el movimiento decorativo (flotación del Inventor, parpadeo de luces, polvo, ventilador, plantas, repintado de ventanas y el ciclo de la arcade).

`main.ts` expone dos flags de lectura. `?perf=1` deja el renderer real y publica `window.__protoLab.rendererStats()` y `batchStats()`. `?e2e=1` fuerza el camino barato de la tabla y, además, omite el polvo y la flotación del Inventor. Las cifras de e2e no sirven de línea base del móvil.

### 1.2 Luces, niebla y color

La escena tiene niebla lineal del color de fondo `0x1a2140`, de 18 a 36. Las luces, todas en la escena desde el arranque:

- 1 `HemisphereLight` (cielo `0xd5e4ff`, suelo `0x5a4638`, intensidad 1.55).
- 1 `DirectionalLight` (sol `0xfff1d0`, intensidad 1.85). Es la única que puede proyectar sombra, y solo con puntero fino.
- 7 `PointLight`: lámpara de la pizarra (intensidad 6, alcance 7.5), arcade (4.5 / 5.2), dos de las tres lámparas colgantes (2.6 / 5.5; la tercera es solo malla), la tele del rincón (4.2 / 3.4) y dos lámparas de pie a media intensidad (2.1 / 4.2).

En Three.js 0.187 `MeshLambertMaterial` sombrea **por fragmento**. Cada luz puntual entra en el shader de todo lo que use Lambert, también donde la atenuación ya vale cero. El coste de una luz nueva casi no se ve en `renderer.info`: se ve en el tiempo de fragmento, que en el móvil es el recurso escaso. Las mallas `MeshBasicMaterial` no pagan ese bucle.

### 1.3 Materiales y texturas

`mat(color)` en `world.ts` reutiliza un `MeshLambertMaterial` por color. Ese es el material de paredes, suelo, muebles y cuerpos. Lo emisivo (bombillas, marquesina, botones, halo de la arcade, cielo, pantallas, neón) es `MeshBasicMaterial`, a menudo con `toneMapped: false`.

No hay `MeshStandardMaterial`, mapas de normales, entorno ni lightmaps. El relieve visual sale de texturas de canvas pintadas al crear la escena:

| Textura | Tamaño | Dónde |
| --- | --- | --- |
| Cielo del techo | 64×64 | `skyGradient()` en `world.ts` |
| Marquesina | 512×128 | `marqueeTexture()` |
| Laterales de la arcade | 256×384, una por lado | `cabinetSideTexture()` |
| Pantalla de la arcade | 512×320, o la preview del prototipo | `applyTitleCard` / `TextureLoader` |
| Pizarra de propuestas | 960×540 | `whiteboard-status.ts` |
| Pósters | 128×180 | `ambient.ts` |
| Garabato de pared | 256×160 | `ambient-corners.ts` |
| Ventanas de noche | 96×72, dos | `createNightWindow` |
| Monitor del escritorio | 64×48 | `createBlinkingScreen` |
| Tele del sofá | 64×48 | `ambient-lounge.ts` |

Las ventanas se vuelven a pintar **cada frame** (`paintNightWindows` → `needsUpdate`). La tele se repinta como mucho cada 0,16 s. El monitor solo cuando el seno pasa de 0,92. Esas tres llevan `userData.live` y el batch no las funde.

### 1.4 Mundo, objetos y personajes

La sala útil va de x −9.6 a 9.6 y de z −7.4 a 12, con el techo a `CEILING_UNDERSIDE` (3.42). El suelo, los muros, la alfombra central, los caminos, los rodapiés y el techo (cuatro planos más un cielo) se construyen en `startWorld`, `addFloorPaths`, `addWallTrim` y `addCeiling`.

El resto son las mismas primitivas, con pocos segmentos (esferas de 6–16, cilindros de 6–12):

- Inventor (`buildInventor`): dos cajas de abrigo, cabeza, pelo, ala y copa del sombrero, dos lentes y **un** brazo. El grupo entero tiene `userData.noBatch`.
- Jugador (`buildPlayer`): caja de torso, dos brazos, cabeza y una nariz. También `noBatch`. No tiene ciclo de paso.
- Arcade (`buildArcadeCabinet`): cuerpo de cajas, marquesina, pantalla, palanca, tres botones y dos laterales pintados.
- Rincón (`ambient-lounge.ts`): tres sofás, mesa, tele, y cuatro personas sentadas (`addSeated`): Remolón, Brasa, Naipe y Croquis. Cada una es torso, regazo, cabeza esférica, nariz, pelo y dos piernas, más un accesorio animado (porro, pipa, cartas, lápiz).
- Rincones (`ambient-corners.ts`): escritorio y monitor, estantería con doce cartuchos y un trofeo, pinball con un vidrio transparente, neón, pizzas, tres plantas, dos lámparas de pie, ventilador de techo, gato sobre cajas, perro, radio, nevera, alfombra y ventanas.
- Ambiente (`ambient.ts`): dos pósters, dos tramos de cable y doce motas de polvo (`noBatch`, transparentes). En `?e2e=1` el polvo no se crea.

No hay biseles, `ExtrudeGeometry` ni `RoundedBoxGeometry`. Una caja son 12 triángulos. La cara de un personaje es una esfera lisa más, a veces, una caja de nariz. No hay ojos, párpados, boca, segundo brazo del Inventor ni piernas.

### 1.5 Batch estático

`batchStaticMeshes` (`apps/world/src/static-batch.ts`) corre al cerrar la construcción, salvo con `?batch=0`.

- A partir de 3 mallas con la misma firma de parámetros, el mismo material, la misma sombra y el mismo `interactId`, crea un `InstancedMesh`.
- El resto, de dos en dos con el mismo material y los mismos atributos, se funde con `mergeGeometries`.
- Se quedan fuera las transparentes, los materiales `userData.live` y cualquier malla con `noBatch` en ella o en un ancestro.
- Un adorno que proyecta sombra y mide menos de `MIN_SHADOW_RADIUS` (0.22) deja de proyectarla. En móvil nadie proyecta, así que esa poda no actúa.

La firma de instancia usa `geometry.parameters`. No mira colores de vértice. Dos cajas del mismo tamaño con un AO distinto se instanciarían con la geometría de la primera y el AO se perdería. Hoy no hay colores de vértice, así que no se nota.

En móvil el batch deja la escena en 290 mallas → 165, con 10 grupos instanciados, 35 fundidos y 0 proyectores de sombra. En escritorio, al partir los cubos por `castShadow`, salen 177 mallas y 32 proyectores.

### 1.6 Animación que ya da vida

Con movimiento permitido, cada frame (`world.ts` y los `tick` de ambiente):

- El Inventor flota (`sin` a 2 Hz, 4 cm) y mueve el brazo.
- Las puntuales de techo, la de la pizarra, las de pie y la tele varían de intensidad, con un parpadeo raro.
- Las tiras de la arcade, el neón y el dial de la radio pulsan el color del material (`pulses`).
- El anillo de proximidad pulsa la opacidad.
- Doce motas de polvo derivan. La nevera escala un punto blanco. El ventilador gira. Las copas de las plantas se balancean.
- El gato mira al jugador. El perro enseña un «Zzz…» en HTML cercano. La radio cambia de tono si te acercas.
- Remolón mueve el brazo, Brasa y Remolón suben humo, Naipe baraja una carta, Croquis mueve el lápiz.
- La arcade avanza de prototipo sola cada 4,5 s si hay más de uno.

El gato, el ventilador, las plantas, el polvo, los brazos del rincón y las pantallas ya están marcados para no fundirse. Un gesto nuevo en una malla que el batch se haya llevado no se va a ver: hay que dejar esa pieza en `noBatch`, o animar un hijo que ya lo esté (el Inventor y el jugador enteros).

Los letreros (`CSS2DObject`) son DOM. No entran en `renderer.info` y no conviene multiplicarlos para «dar detalle».

## 2. Propuestas

El orden de cada ficha es: qué hacer, coste en un iPhone, por qué, impacto visual. «Bajo» cabe en el presupuesto medido más abajo. «Medio» solo si ese lote se mide y sobra sitio. «Alto» queda fuera.

### 2.1 Calidad de render que sale barata

**Sombras de contacto en el suelo.** Un disco oscuro, `MeshBasicMaterial` transparente, `depthWrite: false`, bajo el Inventor, el jugador, la arcade, los sofás, la mesa y la nevera. Fundir esos discos en **una** malla: el batch ignora las transparentes, así que sueltas serían una llamada cada una. Coste bajo (una llamada y un poco de sobrepintado si no se apilan). Impacto alto en móvil, porque el mapa de sombras está apagado y los objetos flotan.

**Oclusión en el color de vértice del suelo y de los muros.** Subdividir el plano del suelo (un `PlaneGeometry` de ~16×20 segmentos son unos 640 triángulos, una sola llamada) y oscurecer vértices en el zócalo y bajo los muebles grandes. En los cuatro muros, un par de cortes verticales bastan para un degradado suelo-techo. `MeshLambertMaterial` ya admite `vertexColors`. Coste bajo: son las mallas más grandes y no se instancian (hacen falta 3 copias idénticas). Impacto medio: la sala deja de ser un color plano y gana peso sin una luz nueva. No poner este AO en cajas repetidas (cartuchos, patas, botones): la firma de `static-batch.ts` no distingue colores de vértice y la instancia enseñaría el de la primera.

**Degradado del cielo un poco más fino.** El canvas de `skyGradient` es de 64×64 y se estira a un plano de 22×24. Subirlo a 128 o 256 y añadir un grano suave en el propio canvas. Coste bajo (una textura que no se actualiza). Impacto bajo-medio: menos bandas en el techo.

**Bajar el repintado de las ventanas a unos 10 Hz.** Hoy `paintNightWindows` sube dos canvas de 96×72 en cada frame. Coste negativo: quita una subida de textura por frame y deja sitio. Impacto visual bajo; las nubes a 10 Hz se siguen leyendo.

**Contraste con la luz que ya hay.** La hemisférica a 1.55 aplana el Lambert. Bajarla un poco y dejar el sol, después del AO y no a la vez, recupera volumen. Coste bajo (cero geometría). Impacto medio y global: cambia el humor de toda la sala, así que va en un lote propio y con la sala delante, no como primer cambio.

**Un lightmap que sustituya una puntual, no que se sume.** Una textura pequeña en el suelo con los charcos cálidos de la lámpara y de la arcade, y apagar una puntual secundaria (una de pie). El shader Lambert se acorta. Coste bajo si de verdad se apaga una luz; medio si el lightmap se añade y las nueve luces siguen. Impacto medio. Es el único cambio de luces que encaja con «no perder rendimiento», y solo después de medir los lotes anteriores.

Estas palancas suben el coste de fragmento y se quedan fuera de los lotes:

- Subir el tope de `pixelRatio` por encima de 1.5. En un buffer de 390×844 el salto a 2 multiplica los píxeles por 1,78. Las llamadas no cambian; el tiempo de fragmento sí. Medido: con dpr de dispositivo 3 el canvas de 390×844 queda en 585×1266, que es exactamente 1,5.
- Activar el antialias del canvas en `(pointer: coarse)`. Es MSAA encima de un Lambert con siete puntuales.
- Volver a encender el shadow map, aunque sea a 512. En escritorio, con sombras, el mismo spawn de referencia no es comparable (otro fov), pero el renderer ya dibuja 32 proyectores de más.
- Un `EffectComposer` (FXAA, SMAA, bloom). Es otro pase a pantalla completa.
- Pasar el laboratorio a `MeshStandardMaterial` o añadir luces puntuales «para dar ambiente». El ambiente ya pulsa las que hay.

### 2.2 Detalle de modelos, con el mismo lenguaje

La regla para no pagar en llamadas: pieza nueva del color de `mat()` que ya exista, para que el batch la absorba; pieza que se mueva, pequeña y con `noBatch`. Fundir a mano las partes quietas de un personaje que hoy es `noBatch` entero (Inventor y jugador) baja llamadas a la vez que se le añade cara.

**Inventor con cara, dos brazos y un cuerpo que respira.** Ojos como dos esferas o cajas muy pequeñas que escalan en Y para parpadear, ceja o puente de las gafas, segundo brazo, dos piernas-caja, un bolsillo o una insignia del color del abrigo. El torso puede escalar un 2 % en un seno lento. El grupo ya no entra al batch, así que hoy son unas nueve llamadas: fundir abrigo con sombrero, y pelo con ala, deja sitio para los ojos sin subir el total. Coste bajo si el recuento de llamadas del personaje se mantiene o baja. Impacto alto: es a quien se mira al hablar.

**Jugador con ojos y un balanceo al andar.** Misma fusión (la camiseta teal en una malla, la cabeza en otra). Ojos que parpadean y un seno corto en la altura cuando `moving` es verdad. Coste bajo. Impacto medio-alto, porque ocupa el centro del encuadre.

**Los cuatro del sofá: ojos, parpadeo y un pecho aparte.** El cuerpo puede seguir en el batch. Los ojos y una caja de pecho van en `noBatch` (del orden de tres mallas por persona, doce en total). Remolón, Brasa, Naipe y Croquis ya tienen un `tick`: el parpadeo y un seno de 2 % caben ahí, y el porro, la pipa, las cartas y el lápiz se quedan. Un pendiente, una pinza o un taco de cartas del color que ya usa el archivo suma triángulos y el batch se los come. Coste bajo (unas doce llamadas nuevas en una escena que, en apaisado, va por 138). Impacto alto en el rincón, que es donde el jugador se sienta a hablar.

**Gato y perro.** El gato ya gira la cabeza (`noBatch`): orejas de caja, una cola que oscila y un parpadeo. El perro tiene el cuerpo en cajas que el batch puede fundir; para que el lomo suba al roncar, la cabeza o una caja de lomo tienen que quedar en `noBatch`. Coste bajo. Impacto medio: son los únicos animales y hoy se leen como un bloque.

**Arcade, pinball y escritorio con cantos, no con otro material.** Tiras finas del mismo `mat` que el cuerpo, o un `RoundedBoxGeometry` solo en la caja grande de la arcade (pocos segmentos). Botones y palanca ya existen; un coin o una pegatina sería un canvas nuevo y una llamada que no se funde, así que mejor una caja del color ámbar que ya pulsa. En el pinball, los bordes del tablero y un par de bumpers del color del trofeo. En el escritorio, el monitor ya parpadea: un teclado de cajitas del color de las teclas que ya hay. Coste bajo si no hay material nuevo; medio si cada prop trae su textura. Impacto medio en los tres objetos a los que la cámara se acerca.

**Plantas, ventilador y lámparas.** Las copas ya se balancean. Una maceta con un anillo de tierra (cilindro del color de la maceta) y una hoja más, reutilizando la geometría de la hoja. El ventilador ya gira: no hace falta otro. Las bombillas ya son esferas emisivas. Coste bajo. Impacto bajo-medio.

**Atrezzo que el batch absorbe.** Libros, una taza, un cable más, un marco, usando solo colores que `mat()` ya creó en ese archivo. Cada color nuevo es un material y, tras el merge, suele ser una llamada nueva. Un lote de atrezzo cabe en cero a tres llamadas si respeta la paleta, y se dispara si cada objeto estrena color. Coste bajo con paleta cerrada. Impacto medio en los rincones, bajo si se reparte por el patio (la niebla se lo come).

Gestos que encajan en los `tick` actuales, todos de coste bajo porque mueven una matriz y no una textura:

- Parpadeo: escala Y del ojo en un seno, cerrado un instante cada pocos segundos, desfasado por personaje.
- Respiración: escala Y del pecho o del torso, 1–2 %, más lenta que el parpadeo.
- Peso: el Inventor ya flota; un balanceo lateral muy corto al estar quieto basta. El jugador solo rota hacia la marcha.
- Oreja o cola del gato, lomo del perro, ya descritos.

Un parpadeo pintado en un canvas cada frame sería otra subida de textura. La escala de una malla es el gesto barato.

## 3. Orden recomendado

Cada lote lo puede llevar un agente. Los que comparten fila tocan archivos distintos. El lote 3 espera al 2 porque los dos editan `world.ts`. Nadie en estos lotes toca `main.ts`, diálogos, audio ni el renderer (el tope de pixel ratio, el antialias y el shadow map se quedan como están).

**Lote 1 y lote 2, a la vez.**

| Lote | Archivo | Qué |
| --- | --- | --- |
| 1A | `apps/world/src/ambient-lounge.ts` | Ojos, parpadeo y pecho `noBatch` de Remolón, Brasa, Naipe y Croquis. Un prop por persona solo con colores ya usados en ese archivo. |
| 1B | `apps/world/src/ambient-corners.ts` | Gato (orejas, cola, parpadeo), perro (lomo o cabeza `noBatch`), cantos de pinball y escritorio, ventanas a ~10 Hz. |
| 1C | `apps/world/src/ambient.ts` | Como mucho un póster o un tramo de cable, con los materiales que el archivo ya crea. Si hace falta un color nuevo, no se añade. |
| 2 | `apps/world/src/world.ts`, solo `buildInventor`, `buildPlayer` y `buildArcadeCabinet` | Fundir las partes quietas del Inventor y del jugador, añadir cara, segundo brazo, piernas, respiración y balanceo al andar. Cantos de la arcade con el mismo material. |

`static-batch.ts` no se toca en esta fila. Las piezas nuevas que se muevan llevan `noBatch` en la malla o en un grupo pequeño, no en el sofá entero ni en la arcade entera: eso desharía el merge.

**Lote 3, un solo agente, después del lote 2.**

Archivos: `world.ts` (suelo, muros, una malla de contacto) y, si el AO llega a geometría repetida, `static-batch.ts` para que la firma de instancia incluya un hash de color de vértice. Contenido: discos de contacto fundidos, AO de suelo y muros, y solo entonces un retoque de la hemisférica si la sala queda lavada. Sin luces nuevas.

**Lote 4, opcional y solo si el lote 3 sigue dentro del techo de la sección 4.**

Un agente, otra vez `world.ts`: lightmap del suelo que reemplace una puntual secundaria. Si la medición no muestra aire, este lote no se hace.

Fuera de cola, para cualquiera de estos agentes: sombras reales, MSAA, más pixel ratio, postproceso, `MeshStandardMaterial`, modelos glTF y texturas que se repinten cada frame.

## 4. Cómo saber que el rendimiento no empeora

### 4.1 Lo que se midió

Escena de desarrollo (`pnpm --filter @proto-lab/world dev`), URL `/?perf=1`, sin `?e2e=1`. Playwright headless, perfil táctil (`isMobile`, `hasTouch`, de modo que `(pointer: coarse)` es verdad) y `devicePixelRatio` 3. El viewport imita los puntos CSS de un iPhone 13 a pantalla completa: 390×844 y 844×390. Chromium y WebKit dieron las mismas llamadas y los mismos triángulos; las cifras son de la escena, no de un navegador. La GPU de Chromium en esta máquina es SwiftShader (`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero))`). No es la GPU de un iPhone.

`rendererStats()` lee `renderer.info` después de que el bucle haya avanzado. `focus()` coloca al jugador y la cámara se lee dos frames después. Las peticiones a `/api/` se abortaron: el tablón no recibió propuestas. La textura de 960×540 existe igual desde el arranque.

Línea base, puntero grueso, batch activo, buffer a 1,5× (390×844 → 585×1266; 844×390 → 1266×585):

| Vista | Llamadas | Triángulos |
| --- | ---: | ---: |
| Retrato, spawn | 80 | 3624 |
| Retrato, Inventor | 67 | 3580 |
| Retrato, arcade | 81 | 4010 |
| Retrato, pizarra | 58 | 3014 |
| Apaisado, spawn | 138 | 6834 |
| Apaisado, Inventor | 124 | 6240 |
| Apaisado, arcade | 137 | 6798 |
| Apaisado, pizarra | 85 | 4600 |

El batch en ese modo: 290 mallas antes, 165 después, 10 instancias, 35 fusiones, 0 proyectores de sombra.

Otras lecturas, para no mezclarlas con la línea base:

- Escritorio 1280×800, puntero fino, dpr 1, sombras y antialias: spawn 150 llamadas y 6812 triángulos, 32 proyectores, batch 290→177. Con dpr 2 el buffer pasa a 2560×1600 y las llamadas siguen en 150. El fov y el brazo no son los del móvil.
- Sin batch (`?perf=1&batch=0`), perfil Playwright iPhone 13 de 390×664 (no es el alto de la PWA): spawn 134 llamadas y 3576 triángulos, frente a 82 y 4012 con batch en ese mismo perfil. El batch ahorra llamadas. Puede subir triángulos porque el `InstancedMesh` no descarta cada copia por separado.
- `?e2e=1` en ese perfil de 664 px de alto: 76 llamadas, 3796 triángulos, buffer a dpr 1, 278 mallas antes del batch (sin las 12 de polvo). No es el presupuesto del teléfono.
- El dispositivo «iPhone 13» que trae Playwright mide 390×664 y 750×342 (viewport con cromo de Safari, no la PWA). Ahí el retrato con batch dio 82 llamadas y 4012 triángulos. La tabla de arriba es la que hay que usar.

`renderer.info.memory.geometries` no es un presupuesto por frame. Es un acumulado de geometrías subidas a GPU: en el retrato de 390×844 empezó en 71 y, tras visitar la pizarra, llegó a 99. Las texturas hicieron lo mismo (10 y luego 11). Las llamadas y los triángulos sí se reinician en cada `render`.

### 4.2 Lo que no se midió

No hay FPS de un iPhone. La única muestra de tiempo de frame es de SwiftShader, en el perfil bajo de 390×664, 24 frames quietos en el spawn: media 76,7 ms, mediana 83,3 ms. Eso es raster por software en esta VM. No describe Safari en un teléfono y no se usa como techo.

Tampoco se midió el caminar continuo, el tablón con datos reales ni un iPhone con la barra de inicio y el área segura. Un aparato más alto que 844 puntos CSS sube el fill-rate con el mismo tope de 1,5; las llamadas solo cambian si el encuadre enseña más sala.

### 4.3 Techo propuesto a partir de esa línea base

No es una cifra medida de «lo máximo que aguanta el teléfono». Es el margen que un lote de detalle puede gastar sin cambiar de régimen:

- Apaisado en el spawn, que es el peor caso medido: como mucho 160 llamadas y 10 000 triángulos.
- Retrato en el spawn: como mucho 100 llamadas y 6 000 triángulos.
- En `(pointer: coarse)`: 0 proyectores de sombra, pixel ratio efectivo ≤ 1,5, las mismas 9 luces o menos, sin compositor de postproceso.

Un lote que añade una puntual o enciende sombras puede cumplir los triángulos y aun así ir peor. Esas dos cosas se miran en el diff, no solo en `renderer.info`.

### 4.4 Cómo repetirlo, y cómo medirlo en el iPhone

En un navegador de escritorio, con el mundo en marcha:

1. Abrir `/?perf=1` con puntero grueso (emulación táctil) y dpr 3. No usar `?e2e=1`.
2. Esperar a que `window.__protoLab.renderFrame()` avance.
3. Leer `rendererStats()` y `batchStats()` en el spawn y tras `focus('inventor')`, `focus('arcade')` y `focus('chalkboard')`, en 390×844 y en 844×390.
4. Comparar con la tabla de arriba.

En el iPhone, antes del primer lote visual, anotar el baseline del aparato. Safari remoto sobre la PWA instalada, la misma URL `?perf=1`:

- Las mismas cuatro vistas, retrato y apaisado, leyendo `rendererStats()`.
- El tiempo de frame con el timeline de Safari, o con los deltas de `requestAnimationFrame`, unos segundos quieto y unos segundos andando.

Un lote se da por bueno si en ese aparato el frame se mantiene en el refresco que el baseline ya sostenía (un paso estable de 60 a 30 es un fallo) y el tiempo medio no sube más de aproximadamente un 10 % frente a ese baseline, y si las llamadas y los triángulos siguen bajo el techo de la sección 4.3. El primer baseline de iPhone hay que guardarlo en el PR de ese lote: este informe no lo tiene porque desde aquí no se puede tomar.
