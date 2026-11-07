# AGENTS.md — aplicaciones (`protos/<slug>/`)

Contrato de una aplicación dentro del laboratorio. Las reglas del lobby (geometría procedural Three.js, tope de nitidez 1,5, sombras del mundo) **no aplican** dentro de un prototipo: cada slug define su propio aspecto según su issue.

No abras ni copies otros slugs de `protos/` como referencia de aspecto, renderer, luces, antialias o arte. Cada prototipo parte de su issue, de las plantillas en `templates/` y de las skills (`.agents/skills/proto-lab-app/SKILL.md` y, si es un juego, `.agents/skills/godot-juego/SKILL.md`). El contrato web (ventana, Compatibility, un hilo, cupos) está escrito ahí: no lo tomes de otro prototipo publicado.

## Registro y dependencias

El laboratorio aloja aplicaciones hechas con tecnología web: herramientas, utilidades, visualizaciones o experiencias, con o sin canvas. Cada una es una carpeta `protos/<slug>/` con su `proto.json`. Añadir la carpeta basta: no se edita ningún archivo de la raíz para registrarla. Si trae dependencias que el lockfile aún no tiene, `pnpm install` en la raíz actualiza `pnpm-lock.yaml` (ese cambio sí es configuración de la raíz y la CI del pull request pasa a ser la completa).

Hay dos plantillas. Cópialas, no las importes. No hay una plantilla por motor.

- **Código** (`templates/aplicacion/`, pasos en su `LEEME.md`): Vite + TypeScript. Avisa `alive` y `ready`, y `stop()` suelta el bucle, los listeners, el audio y WebGL. Incluye `window.__protoLabData`.
- **Export estático** (`templates/export-estatico/`): shell HTML para un build ya hecho. Añade `alive`, `ready` (con `__protoLabNotifyReady` cuando el export termina de pintar) y `stop()`. No exige `package.json` ni Vite. `pnpm` ignora la carpeta si no hay paquete; el catálogo y el ensamblado sí la publican: copian la carpeta (salvo `proto.json`, `godot/`, `db/`, `node_modules`, `dist` y dotfiles) y exigen `index.html`. Un export de Godot 4 deja el proyecto en `godot/` y el shell de `godot-shell.html`: `ready` en el `then` de `startGame`, `onProgress` reenviado como `progress` y cierre con `requestQuit`. El `.wasm` publicado va en Brotli q11 y se sirve con `Content-Encoding: br`. El workflow descubre `protos/*/godot/`, exporta solo el proyecto que toca el diff y sube el árbol servido como artefacto `godot-export-<slug>`. No tiene token de escritura ni secretos: el agente lo descarga con `gh run download` y lo commitea, sin pisar `proto.json` ni `godot/`. El procedimiento está en el `LEEME` del export estático.

Las skills de Phaser del workspace hablan de loader, escenas y audio por URL. Dentro del laboratorio manda este archivo y, antes que esas skills, [`.agents/skills/proto-lab-app/SKILL.md`](../.agents/skills/proto-lab-app/SKILL.md).

### Propuestas aprobadas: juegos y Godot (2026-11-06)

Si una propuesta **aprobada** describe un **juego**, el agente que la implemente debe hacerlo **en Godot** y usar las capacidades del motor (escenas, física, animación, mapas de teselas, etc.) dentro de los límites ya documentados en este repositorio: preset de móvil en `godot/project.godot`, un solo hilo, sin `SharedArrayBuffer`, cupos de tamaño del sitio y, para WebAssembly, declarar **`wasm`** en `capabilities`.

La dimensión la marca la issue. Si pide 3D, perspectiva, modelos o una cámara en el espacio, la escena de juego es `Node3D` con `Camera3D`. Cenital describe la cámara: en 3D se hace con `Camera3D`, en perspectiva u ortográfica, mirando hacia abajo. `TileMapLayer` solo entra si la issue pide 2D o teselas. El viewport 390×844, `canvas_items` y `expand` son la ventana que exige el validador; no se cambian para hacer el juego 2D ni 3D. En la web el renderer sigue en `gl_compatibility`, que sí pinta 3D. El detalle de escena, luces y assets está en [`.agents/skills/godot-juego/SKILL.md`](../.agents/skills/godot-juego/SKILL.md).

Godot no es solo un enganche de export: el proyecto vive en **`protos/<slug>/godot/`**. El procedimiento de export y el workflow que genera el artefacto están descritos en `templates/export-estatico/LEEME.md` y en la sección **Proyecto** del [`AGENTS.md`](../AGENTS.md) raíz (workflow `exportar-godot.yml`); aquí no se reescriben.

Si el texto de la issue pide **explícitamente** otra tecnología para ese juego, se sigue la issue.

Las propuestas que **no** son un juego (herramientas, utilidades, visualizaciones u otras experiencias) siguen pudiendo elegir libremente entre las tecnologías web disponibles en el laboratorio.

Esta política no obliga a reescribir prototipos ya publicados.

`base` de Vite, cuando la variante es de código, sigue siendo `/protos/<slug>/`.

## Contrato con el laboratorio

El iframe es del mismo origen: `src="/protos/<slug>/"`, sin `sandbox` y sin documento `blob:`.

- Al cargar, si `window.parent !== window`, la aplicación envía `{ source: "proto-lab", type: "alive" }`. Eso solo marca que el documento respondió. No quita la capa de apertura.
- Esa capa es CSS y un SVG inline, sin imágenes ni fuentes. Si la aplicación envía `{ source: "proto-lab", type: "progress", loaded, total }` y `total` es un número de bytes mayor que 0, el arco muestra ese avance. Si `total` es 0 o no llega el mensaje, el arco queda indeterminado. `prefers-reduced-motion` deja el arco quieto.
- Cuando el primer fotograma ya es visible (no una pantalla en blanco), envía `{ source: "proto-lab", type: "ready" }`. El laboratorio quita la capa y da la apertura por buena.
- `readyMs` en `proto.json` es el plazo en milisegundos (por defecto 8000, mínimo 1000, máximo 60000). Si vence sin `ready`, se quita el iframe y queda el aviso con Volver, aunque `alive` hubiera llegado.
- `window.__protoLabApp.stop()` es obligatorio. El laboratorio lo llama al cerrar, luego navega el iframe a `about:blank` y lo elimina. La aplicación también lo llama en `pagehide`.
- `capabilities` es opcional y de lista cerrada, sin duplicados: `save`, `wasm`, `shared`, `tables`, `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope`, `magnetometer`. Cualquier otro valor falla el validador del catálogo (CI). `permissions` sigue aceptándose como lista solo de dispositivos; si convive con `capabilities`, se unen.
- `save`: el laboratorio atiende el mensaje `save` solo si está declarado. Sin él, `__protoLabData.get` / `set` / `remove` no reciben respuesta.
- `wasm`: la CSP de `/protos/<slug>/` añade `'wasm-unsafe-eval'` a `script-src` solo en ese slug. El resto del sitio no lo lleva. Lo escribe el ensamblado en `dist/_headers`. Si `index.wasm` es un módulo wasm en Brotli, el mismo `_headers` pone `Content-Type: application/wasm` y `Content-Encoding: br` en esa ruta.
- Permisos de dispositivo: el cargador escribe el atributo `allow` del iframe solo con `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope` y `magnetometer`, en ese orden. `save`, `wasm`, `shared` y `tables` no entran en `allow`. La `Permissions-Policy` de `/` y de `/index.html` los abre para `self` para poder delegarlos. En `/protos/<slug>/` el ensamblado deja en `(self)` solo los que declara ese manifiesto; el resto del sitio sigue en `()`. `payment` y `usb` siguen cerrados.
- La aplicación servida cabe en **64** archivos, **12 MiB** por archivo y **32 MiB** en total. Un archivo de más de **25 MiB** falla siempre: es el tope de Cloudflare Pages. Un JS de más de **1,5 MiB** avisa; uno de más de **4 MiB** falla el build. Una imagen o un audio servidos fallan a **1,5 MiB**; el wasm y el pck siguen en 12 MiB. El puente de datos sigue en 4 MiB / 16 MiB y no es este cupo. El HTML o el JS servidos tienen que mencionar `__protoLabApp` y la señal `ready`. Un `.wasm` con memoria compartida, o un HTML con `GODOT_THREADS_ENABLED = true`, también falla. Lo comprueba `scripts/app-budget.mjs` dentro de `pnpm build` (ensamblado) y del atajo de aplicaciones (`.github/scripts/ci-protos.sh`).
- Móvil primero no es un solo teléfono: el diseño vale para el móvil en general y para escritorio, con soluciones web estándar. No hay ramas por agente de usuario salvo para textos de ayuda. Un parche de un solo motor solo si es imprescindible, aislado y justificado en un comentario del código. El build lo exige: el HTML servido lleva un meta viewport con `width=device-width` y, en el HTML, el CSS o el JS, `touch-action: none`. Si hay `godot/project.godot`, el proyecto es 390×844, estirado `canvas_items` con aspecto `expand`, orientación vertical, `emulate_touch_from_mouse=true` y `for_desktop=false`. El mismo validador falla el build. No hay un smoke por aplicación: la fluidez en un teléfono real la confirma el dueño.
- Sin hilos ni `SharedArrayBuffer`: no hay `Cross-Origin-Opener-Policy` ni `Cross-Origin-Embedder-Policy`. Los formularios no se envían (`form-action 'none'`). Sin navegar la ventana superior.
- Imágenes, audio y JSON van por `window.__protoLabData` y una ruta relativa del slug, con el cupo de 64 rutas, 4 MiB, 16 MiB y 128 peticiones. El puente `asset-request` sigue disponible para la lista `assets`, con el mismo cupo. El laboratorio no inyecta `__protoLabAssets`.
- Guardado, si `save` está declarado: `get` / `set` / `remove` de `__protoLabData`. El laboratorio escribe `proto-lab:app:<slug>` (32 claves, 32 KiB por valor, 256 KiB por slug).
- Datos compartidos, si `shared` está declarado: `sharedGet` / `sharedSet` / `sharedRemove`. La Function `POST /api/apps/<slug>/shared` lee el slug de la ruta, la identidad del JWT de Access y escribe en D1 con sentencias fijas, en la tabla del laboratorio `lab_shared_entries`. Mismo cupo: 32 claves, 32 KiB por valor, 256 KiB por slug. No es un sondeo: cada llamada gasta una petición de Workers. Si D1 pasa el cupo gratuito, la API responde `quota` y no reintenta.
- Tablas propias, si `tables` está declarado: `query(nombre, params)` llama a `POST /api/apps/<slug>/query`. El SQL vive en `protos/<slug>/db/` y no se publica. Las tablas llevan el prefijo del slug (`mesa-roja` → `mesa_roja__`). Cómo crearlas, cambiarlas y borrarlas está en [`docs/contrato-tablas.md`](../docs/contrato-tablas.md). `pnpm generate` escribe `functions/_lib/table-queries.json` (no se versiona).

`proto.json`: `slug` igual a la carpeta, `title` (hasta 80), `description` (hasta 2000), `author`, `date` (`AAAA-MM-DD`), `tags`, `version` semver e `history` que incluya la versión actual (`version`, `date`, `note`). Opcionales: `cover`, `preview`, `assets`, `capabilities`, `permissions`, `readyMs`, `hidden: true`. En la variante de código, el `base` de Vite es `/protos/<slug>/`.

Al implementar una iteración, el manifiesto y su historial forman parte del cambio, no un extra opcional.

### Recursos privados (`assets` en `proto.json`)

Opcional y heredado: `"assets": ["media/icon.png", …]` — rutas relativas dentro de la carpeta del prototipo (sin `..`, sin absolutas, sin esquema). El lector del catálogo (`scripts/asset-path.mjs` + `scripts/catalog-lib.mjs`) exige que el archivo exista en el prototipo (raíz, `public/` o `dist/`) y aplica límites: **64** rutas como máximo, **4 MiB** por archivo, **16 MiB** en total. El catálogo expone la lista normalizada.

Las plantillas exponen `window.__protoLabData` para el mismo cupo (64 rutas, 4 MiB, 16 MiB, 128 peticiones) sobre cualquier ruta relativa del slug, no solo la lista `assets`:

- `load(ruta)` → `{ mime, buffer }`
- `json(ruta)` → valor JSON
- `blobUrl(ruta)` → URL de objeto para imagen o audio
- `get(clave)` / `set(clave, valor)` / `remove(clave)` — el valor es un string, guardado de una persona
- `sharedGet(clave)` / `sharedSet(clave, valor)` / `sharedRemove(clave)` — dato compartido entre sesiones, solo si `capabilities` incluye `shared`
- `query(nombre, params)` — consulta declarada de la aplicación, solo si `capabilities` incluye `tables`. El navegador manda el nombre y los parámetros; el SQL no sale del repositorio
- `revoke()` — lo llama `stop()`

### `stop()`

`window.__protoLabApp.stop()` tiene que:

- cancelar `requestAnimationFrame` u otros bucles
- quitar listeners
- cerrar `AudioContext` (`close()`)
- soltar WebGL (`renderer.dispose()` si hay uno, y `WEBGL_lose_context`)
- llamar a `window.__protoLabData.revoke()` si se usaron URL de objeto
- si usas Phaser, `game.destroy(true)`

## Vista previa (`preview.webp`, `preview.mp4`)

- Vistas previas: `pnpm previews` (construye el sitio, arranca `pnpm preview` si hace falta, captura con Playwright y escribe `protos/<slug>/preview.webp`; declara `"preview": "preview.webp"` en `proto.json` si no existía). Sirve para cualquier aplicación: si hay canvas, recorta el más grande; si no, fotografía la ventana. Luego normaliza la foto a 640×360 (16:9): la captura entra entera y centrada, y las bandas usan el color de las esquinas. Opcional: `window.__protoLabPreview` (función o promesa) se llama antes de la foto fija, no antes del clip. Al crear o modificar una aplicación hay que ejecutarlo y commitear en el mismo PR `preview.webp`, `preview.mp4` y `preview-src.sha256`. La CI solo comprueba el clip (MP4 H.264 Baseline, sin audio, faststart, 3 s a 12 fps, dentro de 320×180, tope 160 KiB) y que el sello coincide con las fuentes; no lo graba.
- Opcional en `proto.json`: `"preview": "preview.webp"` (o `.png`) apuntando a un archivo en la carpeta del prototipo; el catálogo expone `previewHref` y el selector del lobby lo muestra. Genera la imagen con `pnpm previews` y commitea el archivo (640×360, menos de 150 KB). El mismo comando deja `preview.mp4` y `preview-src.sha256`, que también se commitean.
- Opcional en `proto.json`: `"assets": ["ruta/relativa.png", …]` (puente heredado; ver arriba). Una aplicación nueva pide imágenes, audio y JSON con `window.__protoLabData` y una ruta relativa bajo `/protos/<slug>/`.
- Opcional en `proto.json`: `"capabilities"` (`save`, `wasm`, `shared`, `tables` y permisos de dispositivo) y `"readyMs"` (plazo de `ready`; ver el contrato). `"permissions"` sigue aceptándose como lista de dispositivos. `tables` exige `protos/<slug>/db/` (migraciones y `queries.json`); el contrato está en [`docs/contrato-tablas.md`](../docs/contrato-tablas.md).
- Opcional en `proto.json`: `"hidden": true` excluye el prototipo del selector, la pizarra y el fallback HTML (sigue en el catálogo, build y `/protos/<slug>/` para pruebas).
- Cada aplicación es móvil primero: viewport `width=device-width`, `touch-action: none`, imágenes y audio ligeros (el build falla a 1,5 MiB).

Vista previa: `window.__protoLabPreview` (función o promesa) deja un fotograma para `preview.webp`; el clip `preview.mp4` se graba sin ese gancho. Al crear o modificar la aplicación, ejecutar `pnpm previews` y commitear `preview.webp`, `preview.mp4` y `preview-src.sha256` es obligatorio. La CI comprueba formato, tope y frescura, y no graba. Si no hay canvas, la foto fija es la ventana. La foto queda en 640×360; lo que no se puede recortar va en la zona segura (ver abajo).

### Encuadre de la vista previa

La foto fija es **640×360 (16:9)**, como mucho 150 KB. `pnpm previews` la deja así. Si la captura no es 16:9, entra entera (`contain`), centrada, y las bandas toman el color de las esquinas. Así una app de teléfono no se estira en una pantalla apaisada. La zona segura es el **16:10 central** (en 640×360, 32 px a cada lado): ahí va el título, el HUD y lo que tenga que verse en todas las superficies.

| Superficie | Relación | Ajuste |
| --- | --- | --- |
| Arcade | 16:10 (plano 0,96 × 0,60) | `cover`, centrado. Recorta el 5 % de cada lado de una foto 16:9 |
| Selector | 16:10 (`aspect-ratio: 16 / 10`, `object-fit: cover`) | `cover`, centrado. `object-position` no se fija: el valor inicial es el centro en todos los navegadores |
| Televisión | 16:9 (textura 256×144 y plano de la misma relación) | `contain`, centrado, fondo `#14182b` |

El clip sigue en 320×180 con `contain` (bandas negras si el juego no es 16:9). En la tele, foto y vídeo ocupan el mismo rectángulo: el juego no se desplaza ni se estira al empezar el clip. Las bandas de la foto usan el color de la captura; las del clip siguen negras. El arcade y el selector rellenan el marco; el recorte no llega a una captura vertical ya metida en 16:9, porque el juego queda en el centro, dentro de la zona segura.

`scripts/preview-frame.test.mjs` falla si una foto del catálogo no es 640×360 o pasa de 150 KB. El ajuste en pantalla en el lobby está en `apps/world/src/preview-frame.ts`.
