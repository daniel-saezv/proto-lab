# Propuesta: bajar el consumo de GitHub Actions sin perder la preview combinada

Fecha de la medición: 1 de noviembre de 2026, runs completados entre las 00:00 y las 13:02 UTC. El panel de uso marcaba **633 minutos** de Actions en Linux ese día. Esta propuesta no cambia workflows: mide el día, estima el ahorro de cada palanca y deja un orden de implementación.

## Recomendación

El minuto no se va en el push a `main` ni en los workflows cortos. Se va en repetir, en cada push de cada PR y otra vez al remezclar `main` en el resto de PR abiertas, una CI de unos **20 minutos facturables** cuyo reloj de pared es de unos **3 minutos**. Esa CI lanza once jobs (seis shards de Chromium que vuelven a bajar la misma imagen de Playwright, WebKit, tres jobs de menos de medio minuto que el redondeo cobra a 1 minuto, y el de `main`, que en la PR sale omitido).

La vía que encaja con cómo se revisa el laboratorio es híbrida, en tres fases:

1. Bajar los shards de Chromium de 6 a 3 y dejar fija la etiqueta de la imagen de Playwright, para quitar el job que solo resuelve esa versión. Misma señal de tests, unos **6 minutos menos por run** (~5 de los shards y 1 del job de versión).
2. Cumplir la convención de `[skip ci]` en los commits intermedios y dejar de remezclar `main` en todas las PR abiertas. Ese fan-out, solo, son **175 minutos** de este día (9 runs).
3. Sustituir el fan-out por una rama de integración por plan: las features entran con CI ligera, la persona revisa una sola preview, y Playwright corre ahí. Si esa CI se pone roja, se revierte el merge y se devuelve el fallo al agente de la feature, con su rama todavía viva. No hace falta un agente nuevo que herede el plan entero.

Una cola de merge de GitHub atribuye mejor el fallo y también elimina el fan-out, pero no deja una preview estable del plan antes de producir. Por eso queda como alternativa, no como recomendación.

## 1. Qué corre hoy

El repo es privado. Los minutos de `ubuntu-latest` (Linux de 2 núcleos, tarifa de lista 0,006 USD/minuto) se facturan. GitHub redondea **cada job** al minuto superior: un job de 5 segundos cuenta 1 minuto. Los jobs en paralelo suman; el reloj de pared no es la factura.

Tres workflows y Dependabot:

| Workflow | Cuándo | Qué hace en este día |
| --- | --- | --- |
| `CI` (`.github/workflows/ci.yml`) | `pull_request`, `push` a `main`, `workflow_dispatch` | Casi todo el consumo |
| `Limpiar previews de Pages` | PR cerrada, cron dominical, manual | ~10 segundos de trabajo, 1 minuto facturable |
| `Aviso al Grok Bot` | issue abierta o etiqueta `aprobado` del dueño | Unos 4 segundos, o se omite |
| Dependabot | semanal | Sin runs el 1 de noviembre |

En una PR, `CI` declara estos jobs. El de `main` entra en el workflow con `if` y queda en `skipped`:

1. Typecheck, tests y build (`verificar`)
2. Versión Playwright (lockfile)
3. Typecheck y unitarios (main) — omitido en la PR
4. E2E (chromium 1/6) … (6/6), dentro de `mcr.microsoft.com/playwright:v<lockfile>-noble`
5. E2E (chromium) — compuerta de unos 3 segundos que conserva el nombre del check obligatorio
6. E2E (webkit-iphone)

Eso son once checks de Actions. El duodécimo es el despliegue de preview de Cloudflare Pages, que no gasta minutos de Actions y sí se relanza con cada push y con cada remezcla de `main`.

El grupo de concurrencia ya es `ci-${{ github.workflow }}-${{ github.ref }}` con `cancel-in-progress: true`. Cancela un run viejo de **la misma rama**. No agrupa las PR de un plan: cada rama paga la suya. Un job ya empezado se factura hasta que muere.

En `main`, el push solo ejecuta typecheck, unitarios y la comprobación de la imagen Docker. No hay E2E. El build de producción lo hace Pages, no Actions.

Nada en `.github/` remezcla `main` en las PR abiertas. Lo hace el orquestador, fuera de estos workflows. Cada remezcla es un push a la rama de la PR (`Merge branch 'main' into …` u otro merge de dos padres) y dispara la misma CI completa que un push de feature.

Los checks obligatorios de la PR son `verificar` (en la UI: «Typecheck, tests y build»), `E2E (chromium)` y `E2E (webkit-iphone)`. Un job obligatorio que el workflow **omite** no cuenta como éxito y bloquea el merge. Cualquier filtro por rutas tiene que conservar esos tres nombres en verde, aunque sea con un job que termine enseguida, o el filtro deja la PR atascada.

## 2. Medición del 1 de noviembre

Fuente: API de Actions del repo (`workflow_runs` creados el 2026-11-01 y los jobs de cada run). La duración es `completed_at - started_at`. El minuto facturable es el redondeo al alza de esa duración, job a job, sin contar los `skipped`. La API de timing del workflow devolvió ceros y la de facturación de la cuenta respondió 403, así que la cifra de 633 minutos del panel no se pudo leer por API: se reconstruye desde los jobs.

Ventana: 54 runs, todos terminados, el último a las 13:02 UTC. Ningún run de `CI` cancelado. Seis jobs cayeron en 120,0 segundos justos con la precisión de un segundo de la API; si el reloj interno de GitHub los pasa de 120, cada uno suma un minuto de más. Eso explica la diferencia con el panel.

| Concepto | Minutos |
| --- | ---: |
| Facturable reconstruido (redondeo por job) | 628 |
| Panel citado para el día | 633 |
| Hueco (jobs en el borde del minuto) | 5 |
| Tiempo real de runner en `CI`, sin redondear | 434 |

### Por tipo de job

Solo el workflow `CI`. «Por run de PR» es la media de las 31 ejecuciones de PR (feature y remezcla).

| Job | Ejecuciones | Real (min) | Facturable (min) | Media por run de PR |
| --- | ---: | ---: | ---: | ---: |
| E2E Chromium, los 6 shards | 186 | 347 | 431 | 13,9 |
| E2E (webkit-iphone) | 31 | 67 | 84 | 2,7 |
| Typecheck, tests y build | 31 | 13 | 31 | 1 |
| Versión Playwright (lockfile) | 31 | 2,8 | 31 | 1 |
| E2E (chromium), la compuerta | 31 | 1,8 | 31 | 1 |
| Typecheck y unitarios (main) | 8 | 3,4 | 8 | — |
| **Total CI** | | **434** | **616** | **19,6** |

Los otros workflows suman **12 minutos** facturables (9 de limpieza de previews, 3 de avisos al bot) sobre poco más de un minuto de trabajo real. Dependabot, cero.

El redondeo son **182 minutos** de los 616 de `CI` (un job de 25 segundos y otro de 5 se cobran igual que uno de 50). Chromium es el 70 % de la factura de `CI`. WebKit, el 14 %.

### Por evento

Un sync es un `pull_request` cuyo HEAD tiene dos padres (merge de `main`, con mensaje `Merge branch 'main'…` o «Integra…»). El resto de pushes a la PR son trabajo de la feature.

| Evento | Runs | Real (min) | Facturable (min) | Parte del día (628) |
| --- | ---: | ---: | ---: | ---: |
| Push de feature en la PR | 20 | 281 | 394 | 63 % |
| Remezcla de `main` en una PR | 11 | 149 | 214 | 34 % |
| Push a `main` tras el merge | 8 | 3,4 | 8 | 1 % |
| Limpieza de previews y aviso al bot | 15 | ~1,4 | 12 | 2 % |

De las 11 remezclas, dos son la propia feature poniéndose al día (PR #47 a las 09:56, 19 minutos; el primer merge de #55 a las 12:22, 20 minutos). Las otras **nueve** son el fan-out de después de un merge a `main`: **175 minutos**. El patrón, visto en los timestamps:

| Merge a `main` | PR que se remezclan acto seguido | Runs de CI completa |
| --- | --- | ---: |
| #50 (11:06) | #51, #52, #53 | 3 |
| #52 (11:13) | #51 y #53, otra vez | 2 |
| #53 (11:26) | #51, otra vez | 1 |
| #54 (12:50) | #55 y #56 | 2 |
| #55 (12:58) | #56, otra vez | 1 |
| #46, #47, #51 | ninguna otra PR abierta | 0 |

Cada una de esas remezclas cuesta lo mismo que un push de feature: unos 20 minutos facturables y una preview nueva de Pages. La PR #51 acumuló 4 pushes de feature (78 min) y 3 remezclas (61 min).

### Dentro de un run de PR

Run de muestra `41309033485` (PR #56, 12:59 UTC, verde, 19 minutos facturables, reloj de pared 3 min 6 s):

| Fase | Chromium, shard ligero (5/6) | Chromium, shard pesado (2/6) | WebKit |
| --- | ---: | ---: | ---: |
| Bajar y arrancar la imagen Docker | 37 s | 32 s | 37 s |
| Checkout, pnpm y Node | ~10 s | ~10 s | ~10 s |
| `pnpm install` + `pnpm build` | ~6 s | ~16 s | ~12 s |
| Tests | 30 s (3 tests) | 1,7 min (5 tests) | 1,4 min (28 tests) |
| Job entero, facturable | 89 s → 2 min | 168 s → 3 min | 150 s → 3 min |

Los seis shards de ese run facturan 13 minutos. El trabajo de test de Chromium, sumado, cabe en unos pocos minutos de CPU: el resto es volver a pagar la imagen, el install y el minuto de redondeo en cada máquina. `verificar` tarda 25 segundos (unitarios ~6 s, build ~1,5 s) y factura 1. El job de versión tarda 5 segundos. La compuerta, 3.

La caché de pnpm ya está caliente (`setup-node` con `cache: pnpm`; el install de `verificar` sale a 2,6 s de media). El repo tiene 30 cachés y 2,8 GB, por debajo de los 10 GB incluidos. Los navegadores no se cachean a propósito: vienen en la imagen oficial. Volver a cachearlos no quita la descarga de esa imagen, que ocurre en un runner nuevo por job.

### Qué runs merecían la pena

Nueve PR tocadas hoy (#46, #47, #50–#56). Ningún mensaje de commit lleva `[skip ci]`: Actions dispara un run por push, así que un par de commits de #46 y el commit de feature de #55 no tienen run propio porque iban en el mismo push que el HEAD. El caso normal sigue siendo un push, una CI de 20 minutos.

| PR | Pushes de feature con CI | Remezclas con CI | Minutos | Nota |
| --- | ---: | ---: | ---: | --- |
| #46 pizarra, óvalo de tiza | 6 | 0 | 117 | Seis verdes seguidos antes del merge |
| #50 audio del joystick en Safari | 4 | 0 | 84 | Tres rojos de WebKit y un verde; el mismo agente lo arregló en su rama |
| #51 detalle gráfico | 4 | 3 | 139 | El primer push era el informe en `docs/` y aun así corrió Playwright |
| #47 rincón | 2 | 1 | 59 | |
| #53 juice del diálogo | 1 | 2 | 55 | |
| #56 trazo de la pizarra (abierta) | 1 | 2 | 55 | |
| #52 etiquetas | 1 | 1 | 39 | |
| #55 lámparas | 0 | 2 | 40 | El commit de feature entró en el mismo push que la remezcla |
| #54 cromo móvil | 1 | 0 | 20 | |

Los tres rojos de #50 son señal útil: WebKit pilló el desbloqueo de audio en iOS y el arreglo se quedó en la rama que tenía el contexto. Esos ~63 minutos no son desperdicio. Los seis verdes de #46 (117 minutos) y las nueve remezclas del fan-out (175 minutos) sí: la persona solo mira la preview cuando la CI ya está verde, y cada verde intermedio vuelve a pagar los doce checks.

## 3. Palancas, ahorro y riesgo

Los ahorros están extrapolados a **este** mix (31 runs de PR). Un día con menos PR baja en proporción al número de runs, no al porcentaje de cada job. «Por run» es la cifra estable.

### 3.1 Menos shards de Chromium

Hoy el shard existe para dar otra máquina de 2 vCPU a SwiftShader (un worker por runner) y para que el grupo en serie de recursos privados no comparta máquina con el test de cámara. Con ~30–40 tests de Chromium, seis máquinas pagan seis veces la imagen (~40 s) para repartir unos pocos minutos de test.

Estimación con los tiempos del run de muestra, dejando el grupo de recursos privados en un solo shard:

| Shards | Facturable de Chromium | Reloj del shard más lento | Ahorro por run | Ahorro en un día como hoy |
| --- | ---: | ---: | ---: | ---: |
| 6 (hoy) | ~14 min | ~2,8 min | — | — |
| 3 | ~9 min | ~3 min | ~5 min | ~150 min |
| 2 | ~7 min | ~4 min | ~7 min | ~220 min |

**Recomendado: 3.** El tope que ya usa el repo (job de Chromium por debajo de 5 minutos en CI, test suelto por debajo de 15 segundos) sigue holgado. Bajar a 2 solo después de medir un `workflow_dispatch` real: si el shard que hereda los recursos privados se acerca a 4 minutos, 2 shards alarga la espera de la persona sin un gran salto respecto de 3.

Riesgo: un mal reparto puede juntar el grupo lento con otro test largo. `fail-fast` no ayuda mucho: los shards arrancan a la vez y, en los tres rojos de hoy, el resto ya había terminado en verde. No sube la calidad bajar el número de workers dentro de un shard; SwiftShader en 2 vCPU sigue pidiendo un worker.

Un runner de 4 núcleos (0,012 USD/minuto, el doble, y al que no se le aplica la bolsa de minutos incluidos de los runners estándar) para fusionar shards sale igual o peor de precio y complica la cuota. No usarlo.

### 3.2 Quitar el job «Versión Playwright»

Dura ~5 segundos y factura 1 minuto por run (**31 minutos** hoy) solo para exponer la versión del lockfile como output y montar el tag de la imagen. La acción de Playwright ya vuelve a leer el lockfile y falla si no coincide con el CLI del contenedor, y `verificar` ya comprueba que la imagen exista.

Dejar el tag escrito en el workflow (`mcr.microsoft.com/playwright:v1.64.1-noble` a día de hoy) y borrar el job. Cuando cambie la versión en el lockfile, `verificar` sigue fallando hasta que el tag se actualice en el mismo PR. Es el mismo acoplamiento que ya hay, visible en el diff.

Riesgo bajo: un bump de Playwright que no toque el workflow se pone rojo en `verificar`, que es lo que se quiere. Ahorro: **1 minuto por run de PR**.

### 3.3 La compuerta `E2E (chromium)`

Otros **31 minutos** hoy, por un `test` de 3 segundos que existe para que el check obligatorio siga llamándose `E2E (chromium)` aunque los shards cambien de nombre. Quitarla obliga a exigir los tres (o seis) nombres de shard en la ruleset, y el siguiente cambio de matriz vuelve a romper la protección.

Dejarla. El ahorro es real y pequeño, y el coste de un check obligatorio renombrado es peor que 1 minuto por run. Cuando la fase 3 baje el número de runs, este minuto baja solo.

### 3.4 Concurrencia que cancele runs viejos

Ya está puesta, por rama. Hoy canceló **cero** runs: el run dura ~3 minutos de reloj y el push siguiente llegaba después. No hay un ahorro escondido que activar.

Conviene dejarla. No conviene ampliar el grupo a todo el plan: cancelaría la CI de otra feature que sí hay que terminar. Un cancel a mitad de run, con los jobs ya en paralelo, se deja casi los 20 minutos pagados. La forma de no pagar el run es no lanzarlo.

### 3.5 CI ligera y CI completa

Un run completo son ~20 minutos. La parte ligera que ya existe (`verificar`: typecheck, unitarios, build, imagen Docker) son **25 segundos, 1 minuto facturable**, y es la misma que corre en `main`.

| Dónde correr Playwright | Qué se ahorra | Qué se arriesga |
| --- | --- | --- |
| En cada push y cada remezcla (hoy) | Nada | Es el gasto medido |
| Solo en el commit que la persona va a revisar, y siempre en la rama del plan | Los verdes intermedios. En #46, cinco de los seis runs (~100 min) | Un verde intermedio a veces caza una regresión antes del commit final. La convención de `[skip ci]` ya dice eso y hoy no aparece en ningún mensaje |
| WebKit solo si el diff toca audio, puntero, pantalla completa o safe area, y siempre en la rama del plan | Parte de los 84 minutos de WebKit | El bug de #50 era exactamente eso y se arregló en la rama de quien lo escribió. Si WebKit no corre en esa feature, el fallo nace en la rama compartida |

No quitar WebKit del criterio de «listo». Moverlo al sitio donde el diff puede romper iOS, y a la integración. Los syncs de `main` no necesitan repetirlo si la feature ya lo pasó y la rama del plan lo va a pasar sobre el árbol combinado.

### 3.6 Filtros por ruta

Útil para `docs/**` y cambios que solo tocan Markdown. El primer push de #51 era el informe y pagó un run completo (~19 minutos).

No filtrar `protos/`, `apps/world` ni `e2e/`: el smoke abre el laboratorio, el prototipo y el diálogo. Un proto nuevo que no toca el lobby igual arranca dentro del iframe que el smoke cubre.

El filtro no puede ser un `if` que omita `E2E (chromium)` o `E2E (webkit-iphone)`. Esos checks son obligatorios: un skip bloquea el merge. El job tiene que existir y terminar en éxito cuando la ruta no aplica (y entonces factura 1 minuto, no 20). En un día como hoy el ahorro es de un solo run. Vale la pena al tocar el workflow, no es la palanca grande.

### 3.7 Cachés y build compartido

`pnpm install` y `pnpm build` dentro de cada shard son ~10–15 segundos. Publicar un artefacto de build y ahorrarse eso en seis máquinas no baja el minuto facturable: el job sigue por encima de 60 segundos por la imagen Docker y los tests. La descarga de la imagen no se puede cachear entre jobs de runners hospedados (cada job estrena VM).

Más caché no es una palanca de minutos. La que ya hay conviene no tocarla.

### 3.8 `[skip ci]` de verdad en los intermedios

La convención ya está en `AGENTS.md` y en el README. Hoy no se usó. Actions y Pages la honran si el **HEAD** del push la lleva; un commit intermedio que luego deja de ser HEAD no evita el run del push siguiente.

Ahorro potencial en este día, grosero: si cada feature hubiera pagado un solo run completo (el que la persona revisa) y se hubieran mantenido los tres rojos de #50, sobran del orden de **150–200 minutos** de pushes verdes repetidos. El fan-out, aparte, son los 175 minutos de la sección 2. La cifra es un techo, no una promesa: algún verde intermedio sí evita un rojo más tarde. El orquestador puede poner la marca en todos los push menos en el que abre o actualiza la PR como lista para revisión.

Riesgo: si el HEAD que se pide revisar lleva la marca, no hay CI ni preview. Eso ya está documentado. El commit que deja la PR lista va sin marca.

## 4. Rama de integración por plan

### 4.1 Cómo quedaría

Una rama `plan/<id>` por plan del orquestador. Las features siguen en su rama y en su issue. Entran en el plan con un **merge commit** (ni squash ni rebase que reescriba), y el mensaje cita el número de issue y el nombre de la rama.

| Evento | CI | Preview de Pages |
| --- | --- | --- |
| Push intermedio de la feature | No corre (`[skip ci]`) | No |
| PR de la feature contra `plan/<id>`, commit listo | Ligera: typecheck, unitarios, build. WebKit además si el diff toca audio, puntero, pantalla completa o safe area | No hace falta; la persona no la usa para decidir |
| Push a `plan/<id>` (entró una feature) | Completa, con los 3 shards y WebKit | Una sola, la del plan |
| PR del plan contra `main`, cuando la persona lo pide | Completa otra vez solo si `main` avanzó desde el SHA ya verde | La misma |
| Push a `main` | Como ahora: typecheck y unitarios | Producción |

La ruleset de `main` y la de `plan/**` exigen los tres checks de siempre. La ruleset de las PR hacia el plan exige solo «Typecheck, tests y build» (y WebKit cuando el workflow lo haya ejecutado). Así un skip no bloquea, porque el check que no corre tampoco es obligatorio en esa rama.

Pages hoy construye cada rama que no es producción. Para que las features no desplieguen, o se limita la integración de Git a `main` y `plan/**`, o los commits de feature llevan la marca que Pages ya entiende. La preview que se revisa es la del plan.

En un día como hoy, el orden de magnitud pasa de ~31 runs completos a unos **9–12 runs completos** (una entrada por feature, más las vueltas de un fallo) y el resto a 1 minuto. Con 3 shards y sin el job de versión, el run completo baja de ~20 a ~14 minutos. La factura del día cae a algo entre **180 y 250 minutos**, contando las vueltas, frente a 628. Si el plan se mergea a `main` de una vez, los 8 pushes ligeros de `main` pasan a ser uno.

### 4.2 El riesgo que ya se vio hoy

El fallo de integración no siempre lo puede arreglar quien lo introdujo, y un agente nuevo no tiene la conversación, la issue ni el motivo del diff.

En este repo el riesgo es concreto, no teórico:

- Casi todo el día se toca el mismo lobby (`apps/world`). Dos features verdes por separado pueden chocar en la misma escena, en un test de humo o en un conflicto de merge. #51 se remezcló tres veces para convivir con etiquetas, juice y el resto.
- El único rojo del día (#50, WebKit, audio en el primer toque del joystick) lo cerró el mismo agente, en la misma rama, en tres intentos. Ese contexto (gesto duplicado, contexto de audio suspendido, `data-playback`) no está en el log de Playwright; está en la rama. Si el primer sitio donde corre WebKit es la rama del plan, el fallo aparece mezclado con las otras features del plan y el sospechoso fácil es el último merge, que puede no ser el del audio.
- Un conflicto de merge en `world.ts` lo resuelve quien entra segundo. Ese agente reescribe código que no propuso. El historial deja de decir quién quería cada comportamiento.

Hay un segundo efecto: mientras el plan está rojo, la única preview que la persona va a mirar está rota para todas las features, también las que no tienen la culpa.

### 4.3 Cómo se mitiga

La regla es devolver el fallo, no adoptar el plan.

1. El plan solo avanza con merge commits. El último verde queda identificado por SHA.
2. Si la CI del plan pasa de verde a rojo, el orquestador **revierte ese merge**. El plan vuelve al SHA verde y la preview se recupera sin esperar al arreglo. Revertir un merge commit es un commit; no hace falta reescribir la rama.
3. El orquestador comenta la issue de la feature (la que el merge citaba) con un paquete corto: nombre del test, proyecto (`chromium` o `webkit-iphone`), enlace al run, SHA del merge revertido, SHA del último verde. No pega el log entero.
4. Se relanza **el agente de esa feature**, sobre su rama, que sigue existiendo hasta que el plan entra en `main`. El arreglo vuelve como commit en su rama y como merge nuevo al plan. No se abre un agente nuevo con la rama del plan como directorio de trabajo.
5. Si ese agente deja la feature verde en su rama y el fallo solo existe combinada, el paquete se amplía a las features mergeadas entre el último verde y el rojo, y se para. Lo decide la persona. No hay un agente «de integración» que recorra el lobby por su cuenta.
6. WebKit en la PR de la feature cuando el diff toca iOS, audio, puntero o pantalla completa. El caso #50 se sigue viendo donde está el contexto. La rama del plan lo vuelve a correr porque la combinación también puede romperlo.
7. Conflictos: quien mergea puede resolverlos si caen en rutas de su feature. Si caen en ficheros de otra, la PR se queda en conflicto y el orquestador avisa; no se reescribe el lobby ajeno dentro del merge. Los planes que parten el mismo fichero (`world.ts`, el diálogo, el cromo) se serializan: el segundo agente recibe el diff ya integrado en el encargo, no descubre el conflicto a ciegas.

Lo que este protocolo no promete: un fallo que solo existe en la suma de dos features no tiene un único autor. La mitigación es acotar el candidato al merge que volvió rojo el plan, dejarle demostrar que su rama sola sigue verde, y entonces preguntar. Es más lento que un agente suelto en la rama del plan, y es el coste de no perder el hilo.

### 4.4 Comparación

| | Preview que se revisa | Cuándo corre Playwright | Si la combinación falla | Minutos, día como hoy |
| --- | --- | --- | --- | --- |
| Ahora | Una por PR, rehecha en cada fan-out para que enseñe `main` | Cada push y cada remezcla (~20 min) | El rojo está en la PR de quien empujó. #50 se arregló así | ~630 |
| Solo higiene, sin rama de plan | Una por PR, desactualizada respecto a las hermanas hasta que alguien pida remezclar esa | El commit listo para revisión | Igual de clara, porque cada PR sigue siendo de un agente | Fan-out (175) y verdes repetidos (~150–200) fuera. Quedan los runs finales y los rojos útiles |
| Rama de integración, CI ligera en la feature, completa en el plan, sin protocolo | Una, la del plan | Al entrar cada feature en el plan | El arreglo lo hereda quien esté libre. Puede no ser quien escribió el diff | ~200–250 si el run completo baja a ~15 min |
| Híbrido (recomendado) | Una, la del plan | Ligera en la feature; WebKit ahí si el diff es de iOS; completa en el plan, con reversión al último verde | Vuelve a la issue y al agente de la feature. Si es un fallo de suma, se para y se pregunta | El mismo orden, más las vueltas de un revert (un run completo cada una) |
| Cola de merge de GitHub | La de cada PR, no la del plan. La combinación es una rama efímera de la cola | Una vez por PR al entrar en la cola, contra `main` actual | La cola expulsa esa PR y deja seguir a las demás. La atribución viene dada | Un run completo por PR, fan-out a cero. No cubre la preview única del plan |

La higiene sola recupera más de la mitad del día y no cambia la atribución. Deja sin cubrir el motivo del fan-out: ver juntas las features antes de producir. La rama de integración cubre ese motivo. Sin el protocolo de reversión, cambia un problema de minutos por un problema de contexto; con el protocolo, el contexto se queda en la rama de la feature y la preview del plan no permanece rota.

La cola de merge es la mejor opción si en algún plan importa más expulsar al PR culpable que mirar una preview única. Choca con «solo se mergea con una orden explícita» si la cola mergea sola al ponerse verde: haría falta una aprobación para entrar en la cola, y la preview previa seguiría siendo la de cada feature por separado, no la del conjunto. No sustituye a la rama de plan para este laboratorio.

## 5. Fases

Nada de esto está aplicado. El orden deja medible cada corte.

### Fase 1 — menos máquina por run

Archivos: `.github/workflows/ci.yml` y el párrafo de shards de `AGENTS.md`.

- Un `workflow_dispatch` de prueba con matriz de 3 shards. Anotar el shard más lento. Seguir con 3 si queda alrededor de 3 minutos; no bajar a 2 en el mismo cambio.
- Escribir el tag de la imagen de Playwright en el workflow y quitar el job «Versión Playwright». `verificar` sigue comprobando que la imagen exista y la acción sigue comprobando el CLI.
- No renombrar `E2E (chromium)` ni `E2E (webkit-iphone)`. No tocar la compuerta.
- Ahorro esperado: unos 6 minutos por run de PR (~180 en un día como el medido): ~5 de pasar a 3 shards y 1 de quitar el job de versión. La suite de tests no cambia.

### Fase 2 — no lanzar el run

Sin cambio de checks obligatorios. Cambio en el orquestador, que es quien empuja y quien remezcla.

- `[skip ci]` en todo push que no deje la PR lista para revisión. El commit listo, sin la marca.
- Dejar de remezclar `main` en todas las PR abiertas tras cada merge. Hasta que exista la rama de plan, remezclar solo la PR que se vaya a revisar, o la que tenga conflicto.
- Ahorro esperado: los 175 minutos de fan-out y la mayor parte de los verdes repetidos. Pages deja de reconstruir las previews que nadie está mirando.

### Fase 3 — una preview por plan

Workflow, rulesets y orquestador.

- Ramas `plan/<id>`. Merge commits que citan la issue.
- CI ligera en la PR de feature hacia el plan. CI completa en el push al plan. WebKit en la feature si el diff toca audio, puntero, pantalla completa o safe area.
- Ruleset distinta por patrón de rama, para que el check que no corre no sea obligatorio ahí.
- Preview de Pages solo de `plan/**` y de `main`.
- Al pasar de verde a rojo: revert del merge, comentario en la issue con el paquete de fallo, relanzar el agente de esa feature. Si la rama sola está verde y el plan no, parar y preguntar.
- Features que compartan fichero, serializadas, con el diff ya integrado en el encargo del segundo agente.
- La PR del plan contra `main` solo cuando haya una orden explícita de merge. Si el SHA del plan ya está verde y `main` no se ha movido, no repetir Playwright.

### Fase 4 — después de mirar una semana de minutos

- Decidir 2 shards si el más lento de la fase 1 se quedó corto.
- Valorar el filtro de `docs/**` con job-puerta de 1 minuto, no con un skip del check obligatorio.
- No añadir runners grandes ni otra caché de navegadores.

Criterio para dar la fase 3 por buena: en un día de varios agentes en paralelo, los minutos de Actions se quedan cerca del número de entradas al plan (no del número de pushes ni del número de PR abiertas por el número de merges), la preview del plan es la que se revisa, y un rojo de integración acaba comentado en la issue de la feature que entró, no en una rama tocada por un agente nuevo.
