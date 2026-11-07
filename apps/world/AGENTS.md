# AGENTS.md — laboratorio (lobby)

**Papel Laboratorio.** Radio de acción: `apps/world/`, `e2e/` y lo que la tarea pida de forma explícita. Una propuesta de issue no activa este papel: es siempre papel Proto y no sale de `protos/<slug>/`. No se edita `.github/` sin petición del dueño.

Instrucciones para cambios en `apps/world/`, el cableado del iframe en el laboratorio y pruebas e2e del mundo. El contrato de una aplicación dentro del iframe está en [`protos/AGENTS.md`](../../protos/AGENTS.md).

## Render del lobby

El laboratorio usa Three.js 0.187 con geometría procedural; no hay modelos de terceros.

- El mundo carga Three en un chunk aparte, después de la pantalla de carga. En móvil el pixel ratio queda en 1,5 como máximo y no hay sombras.
- Si no hay WebGL, la misma app enseña el diálogo y la lista de prototipos en HTML.
- Las notas gráficas del lobby (geometría procedural, tope de nitidez, sombras del mundo) no aplican dentro de un prototipo; ver [`protos/AGENTS.md`](../../protos/AGENTS.md).

## Service worker y catálogo

El service worker cachea la shell y los assets del mundo. No intercepta `/protos/` ni `/api/`.

El catálogo no se edita a mano. `apps/world/src/generated/catalog.json` y `functions/_lib/slugs.json` los regenera `pnpm generate` y no se versionan.

## Iframe, WebGL y cromo

Cada aplicación se abre en un iframe del mismo origen, `src="/protos/<slug>/"`, dentro del overlay del arcade. No hay `sandbox`, ni documento `blob:`, ni script clásico inyectado. Antes de montarlo, el laboratorio pide la página con la cookie de la sesión y rechaza otro origen, una ruta fuera de `/protos/`, una respuesta que no sea HTML o el HTML de login de Access: en ese caso no hay iframe y se muestra el aviso con Volver. La CSP del sitio usa `frame-src 'self'` y `frame-ancestors 'self'`. `X-Frame-Options: DENY` cubre el laboratorio; en `/protos/*` se quita, porque si no el iframe no cargaría.

En producción y en las previews, Cloudflare Access tiene que permitir que la aplicación se enmarque (`allow_iframe` en la aplicación de Access). Eso lo configura el dueño en el dashboard; sin ello el iframe puede caer en el PIN aunque el laboratorio ya haya pasado Access. El e2e local no pasa por Access.

Al abrir, el laboratorio suelta el renderer WebGL del mundo (un solo contexto). Al cerrar, lo reconstruye en un canvas nuevo y conserva la escena y la posición del jugador. El cierre llama a `window.__protoLabApp.stop()`, pone el iframe en `about:blank` y después lo quita. Una capa cubre el iframe hasta la señal `ready`: una pantalla en blanco no cuenta como arranque.

Mientras se juega, el cromo nace plegado: solo un tirador semitransparente en la esquina inferior derecha (`env(safe-area-inset-*)`, área táctil de 44 px, el resto de la pantalla sigue recibiendo el toque). Al quedar listo el prototipo, un aviso breve («Abrir controles») señala ese tirador durante unos 2 s y se retira solo, o antes si el panel se abre; no recibe toques ni deja una capa. Con puntero fino y hover el tirador visible pasa de 18 px a 36 px (área de 56 px); en táctil sigue el punto pequeño. Escape o el tirador lo despliegan (`aria-expanded` y foco visible); se pliega al pulsar fuera, al elegir una acción o a los 4 s. Si la apertura falla, el cromo se queda desplegado para que Volver siga a mano. Pantalla completa pide `requestFullscreen` sobre el overlay (`#stage`), en el mismo gesto del clic, para que el cromo de Volver siga dentro. El `allow` del iframe no interviene: la petición es del documento superior y la política por defecto de `fullscreen` ya es `self`. Si la API no existe, `fullscreenEnabled` es falso, la promesa falla o no se asienta en 700 ms, el mismo botón activa el modo CSS (`is-pseudo-fullscreen`): fijo, `100dvh`, `safe-area`, sin scroll y con el laboratorio oculto. El botón pasa a decir Salir y se sincroniza con `fullscreenchange`. Si la app ya ocupa la ventana (`display-mode: standalone`, `navigator.standalone`, o `display-mode: fullscreen` sin un elemento en la Fullscreen API), el botón se oculta: en ese modo la petición nativa no cambia el cromo y a veces la promesa no termina. El prefijo `webkit` solo se usa si el método estándar no existe. El parche de un solo motor, si hace falta, va justificado en el código.

El guardado de una persona va a `localStorage` del laboratorio, en la bolsa `proto-lab:app:<slug>`, solo si `capabilities` incluye `save`. La aplicación deja `localStorage` y `sessionStorage` en manos del laboratorio y no navega la ventana superior.

El atributo `allow` del iframe sale solo de los permisos de dispositivo declarados en el manifiesto del prototipo.

### Puente heredado `asset-request`

El laboratorio responde a `{ source: "proto-lab", type: "asset-request", id, path }` si `event.source` es el `contentWindow` del iframe, la ruta está en la lista `assets` del manifiesto y no se superan **128** peticiones por apertura. Guarda el buffer durante esa apertura y lo clona una vez hacia el iframe, sin `slice` previo. Acepta imágenes, audio y JSON (`application/json`; un `.json` servido como `text/plain` también, si el cuerpo parsea). No inyecta `window.__protoLabAssets`.

El guardado lo escribe el laboratorio vía mensaje `save` solo si `proto.json` declara `save`. Mensaje `{ source: "proto-lab", type: "save", id, op: "get"|"set"|"delete", key, value? }` y respuesta `save-result`. Sin esa capacidad el mensaje se ignora.

## Inventor, taller y audio del lobby

- El diálogo es un guion fijo. No hay LLM ni llamadas de pago.
- Workers AI lo usa solo el taller del Inventor (`POST /api/workshop`); una aplicación no declara `ai`. R2, Durable Objects e Images no están activos. El detalle está en [`docs/tecnologias-bajo-demanda.md`](../../docs/tecnologias-bajo-demanda.md).
- Los límites de título, descripción y propuestas por día están duplicados en `functions/_lib/validate.ts` y `apps/world/src/limits.ts`. Un test falla si divergen.
- Las pistas del lobby (`/protos/audio/*.m4a`) se sirven con caché larga e inmutable. `pnpm build` copia cada archivo a un nombre con hash de contenido y reescribe el bundle para que un cambio de pista cambie la URL. El service worker sigue sin interceptar `/protos/`.
- Cada prototipo declara sus dependencias en su `package.json`. Phaser no entra en el bundle del laboratorio.

En local la Function responde 401 salvo que el proceso tenga `ALLOW_DEV_AUTH=true`, la petición sea a loopback y lleve `X-Dev-User-Email`. Esa variable no se define en Pages. En Pages la identidad es el JWT de Access (`CF_ACCESS_AUD`). Para crear issues de verdad hace falta además `GITHUB_TOKEN` en el entorno del servidor, nunca en el cliente.

## Vista previa en el lobby

El ajuste en pantalla está en `apps/world/src/preview-frame.ts` (`cover` con la repetición UV, `contain` al pintar la tele). Las dimensiones y la generación de `preview.webp` / `preview.mp4` las describe [`protos/AGENTS.md`](../../protos/AGENTS.md).

La rotación del arcade no vuelve a pedir las fotos. Cada still se descarga una vez por página y la comparten la máquina y la tele; la textura de la máquina se conserva entre vueltas. Los mp4 no se precargan: la tele solo decodifica el clip cuando el jugador está cerca. `/protos/*` sigue en `Cache-Control: no-cache` (no hace falta tocar `_headers`): una URL estable con `immutable` se quedaría vieja tras un deploy, y detrás de Access un `max-age` largo no distingue el despliegue. La memoria de la página evita la revalidación del ciclo. Cada textura son 640×360 sin mipmaps, para que el muestreo coincida en WebGL 1 y 2 y quepa en la GPU del móvil.

**UI del tablón:** en el laboratorio 3D, la **pizarra** pinta el tablón en la escena (estado vía `GET /api/proposals/status`). Sin WebGL, el fallback HTML muestra el mismo tablón en un canvas 2D. Textos con `textContent`; la preview abre en pestaña nueva con `rel=noopener noreferrer`. El contrato del endpoint está en [`.github/AGENTS.md`](../../.github/AGENTS.md).

## Comandos del lobby

- Pasada visual del lobby: con `pnpm dev` o `pnpm preview` en marcha, `pnpm shots -- --out shots --prefix antes` (y el mismo comando con `--prefix despues`). Usa los encuadres fijos de `apps/world/src/viewpoints.ts` (aparición, Inventor, arcade, cuatro rincones y cenital) en escritorio 1280×800, dos teléfonos en vertical (390×844 y 412×915) y uno en horizontal (844×390). No se añade otro horizontal: el alto corto ya está en la hoja. Abre el selector en la arcade y compone una sola hoja de contacto. `--debug` añade una cenital con anillos en Inventor, arcade y pizarra. `SHOTS_URL` fuerza la base; si no hay servidor, arranca `pnpm dev`. La carpeta `shots/` no se versiona.
- Tests e2e: `pnpm test:e2e` tras `pnpm build`; Playwright arranca `pnpm preview` en el puerto 4173; los proyectos están en `playwright.config.ts` (escritorio, móvil táctil de la suite y móvil táctil reducido a los tests marcados).

## Pruebas E2E sostenibles

- Para validar un cambio de desarrollo habitual, prioriza en local `pnpm typecheck`, `pnpm test:unit` y `pnpm build`, y revisa el resultado del PR. La CI ejecuta Playwright cuando el diff toca el laboratorio o su configuración; un PR que solo cambia `protos/<slug>/` no lo hace. Si el e2e falla, lee el log o el informe del job, corrige, vuelve a pushear y repite hasta que la CI quede verde.
- Ejecutar Playwright en local encaja cuando ayuda a una tarea concreta: investigar un fallo, flakiness o lentitud del e2e, capturas, depurar un spec u otras tareas puntuales. En esos casos, lanza solo los specs que necesites (`pnpm exec playwright test <spec>` tras `pnpm build`; evita la suite entera salvo que sea imprescindible).
- Si un job o una run tarda más del **doble** de lo habitual (shard de escritorio ~2–4 min, móvil de la suite ~3 min, móvil táctil reducido ~3 min), no te limites a esperar o re-lanzar: investiga (regresión, import o estilo roto, `?e2e=1` sin aplicar, timeouts) y arréglalo o explícalo en el PR.
- Prioriza tests unitarios para lógica pura; reserva e2e al cableado en un navegador real (`/?e2e=1` activa render ligero: sin sombras ni antialias, `pixelRatio` 1 y animaciones decorativas reducidas; no afecta al uso normal).
- Añade como mucho **1–2** tests e2e nuevos por cambio; extiende flujos existentes cuando puedas.
- Ningún test nuevo debería superar **15 s** en el proyecto de escritorio; ese job debería quedar **por debajo de 5 min**. Si lo superas, indícalo en el PR.
- Prohibido `page.waitForTimeout`: usa `expect.poll`, `toBeVisible` o atributos expuestos en `?e2e=1` (p. ej. `data-playback` en música).
- Reutiliza helpers en `e2e/helpers.ts`, rutas simuladas del `beforeEach` y `/?e2e=1`.
- Los tests de comportamiento táctil o de layout de móvil se saltan en el proyecto de escritorio y corren en los de móvil táctil. Un viewport fijo no se copia además en el de escritorio.
- Un test limitado a un solo motor solo si ese comportamiento no existe en los demás. El parche va aislado y el comentario del código lo justifica. El caso previsto es el evento de pellizco no estándar.
- En CI, `playwright.config.ts` usa **1 worker** donde el render es por software (satura un runner de 2 vCPU) y **2** en el móvil táctil de la suite, si el job lo lanza con el proyecto de esa suite. El escritorio va en **3 shards** (ver [`.github/AGENTS.md`](../../.github/AGENTS.md)). El móvil de la suite no se parte. El otro móvil táctil es un solo job, sin shard, solo con los tests marcados `@movil`, y no es check obligatorio.
- Un test que solo pasa en reintento hay que arreglarlo o quitarlo; no subas reintentos ni timeouts para ocultarlo.
