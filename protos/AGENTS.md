# AGENTS.md — aplicaciones (`protos/<slug>/`)

**Papel Proto.** Radio de acción: solo `protos/<slug>/` (y `pnpm-lock.yaml` si el prototipo trae dependencias nuevas). Lo que no se toca está en «Reglas que valen para todos» del [`AGENTS.md`](../AGENTS.md) raíz; si la issue lo pide, se comenta en la issue y no se hace.

Este archivo es el contrato de una aplicación con el laboratorio y manda sobre cualquier skill. Orden de lectura:

1. Este archivo.
2. [`.agents/skills/proto-lab-app/SKILL.md`](../.agents/skills/proto-lab-app/SKILL.md): lista de comprobación antes del PR.
3. Si es un juego: [`.agents/skills/godot-juego/SKILL.md`](../.agents/skills/godot-juego/SKILL.md) (motor, comprobación headless, rendimiento, gráficos, interfaz, referencias y arte).
4. El `LEEME.md` de la plantilla que uses.

No abras ni copies otros slugs de `protos/` como referencia de aspecto, renderer, luces, antialias o arte: cada prototipo parte de su issue, de las plantillas y de las skills. Las reglas del lobby (geometría procedural Three.js, tope de nitidez 1,5, sombras del mundo) **no aplican** dentro de un prototipo.

## Qué es una aplicación y con qué se hace

El laboratorio aloja aplicaciones hechas con tecnología web: herramientas, utilidades, visualizaciones o experiencias, con o sin canvas. Cada una es una carpeta `protos/<slug>/` con su `proto.json`. Añadir la carpeta basta: no se registra en ningún archivo de la raíz. Si trae dependencias que el lockfile aún no tiene, `pnpm install` en la raíz actualiza `pnpm-lock.yaml` (ese cambio hace que la CI del pull request sea la completa).

Una propuesta nueva crea `protos/<slug-nuevo>/` copiando una de las dos plantillas (se copian, no se importan; no hay una por motor):

- **Código** (`templates/aplicacion/`, pasos en su `LEEME.md`): Vite + TypeScript, con `package.json`. El `base` de Vite es `/protos/<slug>/`.
- **Export estático** (`templates/export-estatico/`, pasos en su `LEEME.md`): shell HTML para un build ya hecho; basta `proto.json` e `index.html`. `pnpm` ignora la carpeta si no hay paquete; el catálogo y el ensamblado la copian (salvo `proto.json`, `godot/`, `db/`, `node_modules`, `dist` y dotfiles) y exigen `index.html`.

Tecnología:

- Si una propuesta **aprobada** es un **juego**, se hace **en Godot 4.7** y usando el motor de verdad (escenas, física, animación…), salvo que la issue pida **explícitamente** otra tecnología. El proyecto vive en `protos/<slug>/godot/`; la guía está en la skill `godot-juego`.
- Lo que no es un juego elige libremente entre las tecnologías web del laboratorio (Vite, Phaser, Three.js…). Las skills de Phaser del workspace describen un juego suelto: en loader, escenas y audio por URL manda este archivo.
- Esta política no obliga a reescribir prototipos ya publicados.

Export de Godot: el agente no exporta en su máquina. El workflow `.github/workflows/exportar-godot.yml` exporta el proyecto `protos/*/godot/` que toca el diff y sube el artefacto `godot-export-<slug>`; el agente lo descarga con `gh run download` y lo commitea sin pisar `proto.json` ni `godot/`. El procedimiento completo (shell, motor compartido, Brotli, audio) está en `templates/export-estatico/LEEME.md`. Ese workflow solo corre en un pull request que toca `protos/<slug>/godot/` o a mano; `.github/workflows/medir-godot.yml` solo a mano. No se les añade `push`, `schedule` ni otro disparador, y no usan secretos ni R2. Es la única excepción a «un agente que implementa un prototipo no modifica workflows»: existen, se usan y no se editan.

## `proto.json`

`slug` igual a la carpeta, `title` (hasta 80), `description` (hasta 2000), `author`, `date` (`AAAA-MM-DD`), `tags`, `version` semver e `history` que incluya la versión actual (`version`, `date`, `note`). Opcionales: `cover`, `preview`, `assets`, `capabilities`, `permissions`, `readyMs`, `hidden: true`.

- Una **iteración** sube `version` y añade su entrada en `history` en el mismo cambio. No es opcional.
- `readyMs`: plazo de `ready` en milisegundos; por defecto 8000, mínimo 1000, máximo 60000. Un juego de Godot usa 20000.
- `capabilities`: lista cerrada, sin duplicados (ver el contrato). `permissions` sigue aceptándose como lista solo de dispositivos; si convive con `capabilities`, se unen.
- `preview`: `"preview.webp"` (o `.png`); lo escribe `pnpm previews`.
- `assets`: puente heredado (ver «Datos y recursos»).
- `hidden: true` excluye el prototipo del selector, la pizarra y el fallback HTML; sigue en el catálogo, el build y `/protos/<slug>/` para pruebas.

## Contrato con el laboratorio

El iframe es del mismo origen: `src="/protos/<slug>/"`, sin `sandbox` y sin documento `blob:`.

- Al cargar, si `window.parent !== window`, la aplicación envía `{ source: "proto-lab", type: "alive" }`. Eso solo marca que el documento respondió. No quita la capa de apertura.
- Esa capa es CSS y un SVG inline, sin imágenes ni fuentes; no añadas otra imagen de carga. Si la aplicación envía `{ source: "proto-lab", type: "progress", loaded, total }` y `total` es un número de bytes mayor que 0, el arco muestra ese avance. Si `total` es 0 o no llega el mensaje, el arco queda indeterminado. `prefers-reduced-motion` deja el arco quieto.
- Cuando el primer fotograma ya es visible (no una pantalla en blanco), envía `{ source: "proto-lab", type: "ready" }`. El laboratorio quita la capa y da la apertura por buena. Si vence `readyMs` sin `ready`, se quita el iframe y queda el aviso con Volver, aunque `alive` hubiera llegado.
- `window.__protoLabApp.stop()` es obligatorio (ver «`stop()`»). El laboratorio lo llama al cerrar, luego navega el iframe a `about:blank` y lo elimina. La aplicación también lo llama en `pagehide`.
- `capabilities`: `save`, `wasm`, `shared`, `tables`, `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope`, `magnetometer`. Cualquier otro valor falla el validador del catálogo (CI). No existe `ai`: Workers AI lo usa solo el taller del Inventor; R2, Durable Objects e Images no están activos ([`docs/tecnologias-bajo-demanda.md`](../docs/tecnologias-bajo-demanda.md)).
- `save`: el laboratorio atiende el guardado solo si está declarado. Sin él, `get` / `set` / `remove` no reciben respuesta.
- `wasm`: la CSP de `/protos/<slug>/` añade `'wasm-unsafe-eval'` a `script-src` solo en ese slug. Lo escribe el ensamblado en `dist/_headers`. Si `index.wasm` es un módulo wasm en Brotli, el mismo `_headers` pone `Content-Type: application/wasm` y `Content-Encoding: br` en esa ruta.
- Permisos de dispositivo: el cargador escribe el atributo `allow` del iframe solo con `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope` y `magnetometer`, en ese orden. `save`, `wasm`, `shared` y `tables` no entran en `allow`. En `/protos/<slug>/` la `Permissions-Policy` deja en `(self)` solo los que declara ese manifiesto; el resto del sitio sigue en `()`. `payment` y `usb` siguen cerrados.
- Sin hilos ni `SharedArrayBuffer`: no hay `Cross-Origin-Opener-Policy` ni `Cross-Origin-Embedder-Policy`. Los formularios no se envían (`form-action 'none'`). La aplicación no navega la ventana superior ni usa `localStorage` / `sessionStorage` por su cuenta.

### Cupos de lo publicado

La aplicación servida cabe en **64** archivos, **12 MiB** por archivo y **32 MiB** en total. Un archivo de más de **25 MiB** falla siempre: es el tope de Cloudflare Pages. Un JS de más de **1,5 MiB** avisa; uno de más de **4 MiB** falla. Una imagen o un audio servidos fallan a **1,5 MiB**; el wasm y el pck siguen en 12 MiB. El HTML o el JS servidos tienen que mencionar `__protoLabApp` y la señal `ready`. Un `.wasm` con memoria compartida, o un HTML con `GODOT_THREADS_ENABLED = true`, falla. Lo comprueba `scripts/app-budget.mjs` dentro de `pnpm build` y del atajo de aplicaciones de la CI.

### Móvil primero

Móvil primero no es un solo teléfono: el diseño vale para el móvil en general y para escritorio, con soluciones web estándar. No hay ramas por agente de usuario salvo para textos de ayuda. Un parche de un solo motor solo si es imprescindible, aislado y justificado en un comentario del código.

El build falla si el HTML servido no lleva un meta viewport con `width=device-width` y, en el HTML, el CSS o el JS, `touch-action: none` (el canvas o el documento, no un botón suelto). Si hay `godot/project.godot`, el proyecto tiene que ser 390×844, estirado `canvas_items` con aspecto `expand`, orientación vertical, `emulate_touch_from_mouse=true` y `for_desktop=false`.

No se commitea un smoke por aplicación. La comprobación headless de Godot de la skill `godot-juego` se ejecuta en la sesión y no deja tests en el repo. La fluidez en un teléfono real la confirma el dueño.

## Datos y recursos (`window.__protoLabData`)

Las plantillas exponen `window.__protoLabData`. Imágenes, audio y JSON se piden por ruta relativa dentro de `/protos/<slug>/`; el laboratorio no inyecta `__protoLabAssets`.

- `load(ruta)` → `{ mime, buffer }`; `json(ruta)` → valor JSON; `blobUrl(ruta)` → URL de objeto para imagen o audio. Cupo por apertura: 64 rutas, 4 MiB por archivo, 16 MiB en total y 128 peticiones. Es otro cupo distinto del de lo publicado.
- `get(clave)` / `set(clave, valor)` / `remove(clave)`: guardado de una persona, solo con `save`. El laboratorio escribe `proto-lab:app:<slug>`.
- `sharedGet` / `sharedSet` / `sharedRemove`: dato compartido entre sesiones, solo con `shared`. La Function `POST /api/apps/<slug>/shared` escribe en D1 (`lab_shared_entries`). No es un sondeo: cada llamada gasta una petición de Workers. Si D1 pasa el cupo gratuito, responde `quota` y no reintenta.
- `query(nombre, params)`: consulta declarada, solo con `tables`; llama a `POST /api/apps/<slug>/query`. El SQL vive en `protos/<slug>/db/` y no se publica. Las tablas llevan el prefijo del slug (`mesa-roja` → `mesa_roja__`). Cómo crearlas, cambiarlas y borrarlas está en [`docs/contrato-tablas.md`](../docs/contrato-tablas.md). `pnpm generate` escribe `functions/_lib/table-queries.json` (no se versiona).
- Cupo de guardado, local o compartido: 32 claves, clave de hasta 64 caracteres, 32 KiB por valor, 256 KiB por slug.
- `revoke()`: lo llama `stop()`.

`assets` en `proto.json` es opcional y heredado: `"assets": ["media/icon.png", …]`, rutas relativas dentro del prototipo (sin `..`, sin absolutas, sin esquema). El catálogo (`scripts/asset-path.mjs` + `scripts/catalog-lib.mjs`) exige que existan (raíz, `public/` o `dist/`) con el mismo cupo de 64 rutas, 4 MiB y 16 MiB. El puente `asset-request` sigue disponible para esa lista. Una aplicación nueva usa `__protoLabData`.

## `stop()`

`window.__protoLabApp.stop()` tiene que:

- cancelar `requestAnimationFrame` u otros bucles
- quitar listeners
- cerrar `AudioContext` (`close()`)
- soltar WebGL (`renderer.dispose()` si hay uno, y `WEBGL_lose_context`)
- llamar a `window.__protoLabData.revoke()` si se usaron URL de objeto
- si usas Phaser, `game.destroy(true)`; en un export, los ganchos `onStop` del `LEEME`

## Vista previa (`preview.webp`, `preview.mp4`)

Al crear o modificar una aplicación, ejecuta `pnpm previews` y commitea en el mismo PR `preview.webp`, `preview.mp4` y `preview-src.sha256`. El comando construye el sitio, arranca `pnpm preview` si hace falta y captura con Playwright: si hay canvas, recorta el más grande; si no, fotografía la ventana. Declara `"preview": "preview.webp"` en `proto.json` si no existía. Opcional: `window.__protoLabPreview` (función o promesa) se llama antes de la foto fija, no antes del clip.

La CI no graba: solo comprueba el clip (MP4 H.264 Baseline, sin audio, faststart, 3 s a 12 fps, dentro de 320×180, tope 160 KiB) y que el sello coincide con las fuentes.

### Encuadre

La foto fija es **640×360 (16:9)**, como mucho 150 KB. Si la captura no es 16:9, entra entera (`contain`), centrada, y las bandas toman el color de las esquinas: una app de teléfono no se estira. La zona segura es el **16:10 central** (32 px a cada lado): ahí va el título, el HUD y lo que tenga que verse en todas las superficies.

| Superficie | Relación | Ajuste |
| --- | --- | --- |
| Arcade | 16:10 (plano 0,96 × 0,60) | `cover`, centrado. Recorta el 5 % de cada lado de una foto 16:9 |
| Selector | 16:10 (`aspect-ratio: 16 / 10`, `object-fit: cover`) | `cover`, centrado. `object-position` no se fija: el valor inicial es el centro en todos los navegadores |
| Televisión | 16:9 (textura 256×144 y plano de la misma relación) | `contain`, centrado, fondo `#14182b` |

El clip sigue en 320×180 con `contain` (bandas negras si el juego no es 16:9). En la tele, foto y vídeo ocupan el mismo rectángulo. `scripts/preview-frame.test.mjs` falla si una foto del catálogo no es 640×360 o pasa de 150 KB. El ajuste en el lobby está en `apps/world/src/preview-frame.ts`.

## Pull request de una propuesta

- Sigue «Convenciones para agentes (pull requests)» del [`AGENTS.md`](../AGENTS.md) raíz.
- El cuerpo cita siempre el número de la issue (`Closes #N` en una propuesta aprobada implementada) para que el tablón enlace issue y PR.
- Si el cuerpo cierra una issue `propuesta`, el diff solo puede tocar ese `protos/<slug>/` y `pnpm-lock.yaml`; `scripts/ci-paths.mjs` lo falla dentro de `verificar`. Una mención `#N` sin palabra de cierre no dispara la barrera.
- Nunca definas `ALLOW_DEV_AUTH` ni añadas secretos.
