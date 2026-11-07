# Medición: export web de Godot 4.7.2 en un solo hilo

Informe de la medición. El dueño aprobó la fase 4 el 2026-11-03: el wasm va en Brotli q11 con `Content-Encoding: br`, los topes servidos son 12 MiB por archivo y 32 MiB por aplicación (25 MiB de Pages sigue siendo fallo duro). La muestra usada es `medida/godot-minimo/`; las cifras de abajo son la medición, no los topes vigentes.

Runs: [41700556458](https://github.com/daniel-saezv/proto-lab/actions/runs/41700556458) (válido, 5 min 27 s de reloj) y [41699323058](https://github.com/daniel-saezv/proto-lab/actions/runs/41699323058) (el `.wasm` es el mismo; falló la primera sonda de arranque). Godot 4.7.2 stable, preset `Web`, `variant/thread_support=false`. Muestra mínima, viewport 390×844, sin texturas. El `.wasm` es el de la plantilla oficial: una aplicación con arte pesará sobre todo en el `.pck`, no en el motor.

## Tamaños

Disco es el archivo que Pages tendría que guardar. gzip -9, Brotli q5, Brotli q11, zstd -3 y zstd -19 son el cuerpo comprimido. q5 y zstd -3 se acercan a una compresión al vuelo; q11 y zstd -19 son el mejor caso si se precomprime. El plan Free de Cloudflare comprime `application/wasm` (zstd si el navegador lo anuncia, si no Brotli o gzip). Eso baja la descarga, no el tope de 25 MiB del archivo subido.

| Archivo | Disco | gzip -9 | Brotli q5 | Brotli q11 | zstd -3 | zstd -19 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `index.wasm` | 37,68 MiB | 9,62 MiB | 7,94 MiB | 6,58 MiB | 9,00 MiB | 7,15 MiB |
| `index.js` | 273 KiB | 67 KiB | 64 KiB | 58 KiB | 72 KiB | 61 KiB |
| `index.png` | 21 KiB | 19 KiB | 19 KiB | 19 KiB | 19 KiB | 19 KiB |
| `index.audio.worklet.js` | 7 KiB | 2 KiB | 2 KiB | 2 KiB | 2 KiB | 2 KiB |
| `index.html` | 5 KiB | 2 KiB | 2 KiB | 2 KiB | 2 KiB | 2 KiB |
| `index.pck` | 5 KiB | 3 KiB | 3 KiB | 3 KiB | 3 KiB | 3 KiB |
| `index.apple-touch-icon.png` | 4 KiB | 3 KiB | 3 KiB | 3 KiB | 3 KiB | 3 KiB |
| `index.audio.position.worklet.js` | 3 KiB | 1 KiB | 1 KiB | 1 KiB | 1 KiB | 1 KiB |
| `index.icon.png` | 2 KiB | 2 KiB | 2 KiB | 2 KiB | 2 KiB | 2 KiB |
| **Total** | **38,00 MiB** | **9,71 MiB** | **8,04 MiB** | **6,67 MiB** | **9,10 MiB** | **7,24 MiB** |

Bytes del `.wasm`: 39 514 754. SHA-256 `fc74679e3b97f76878947fcd4fbe1268cbfa6188182a2e33bbc3f5dc9bfa57d0`, idéntico en los dos runs. Nueve archivos. El `.pck` de esta muestra cabe en 4 792 bytes; no representa una aplicación con dibujos o audio.

`wasm-opt -Oz` en el mismo artefacto de CI, con exception-handling, deja el `.wasm` en 38 178 633 bytes (36,41 MiB). Ahorra un 3,4 %. Sigue por encima de 25 MiB.

## Cabida

| Tope | Resultado |
| --- | --- |
| 64 archivos | Cabe (9). |
| 4 MiB por archivo | No. Solo lo rompe `index.wasm`. El JS (273 KiB) ni siquiera llega al aviso de 1,5 MiB. |
| 16 MiB en total | No. El total son 38,00 MiB. Sin el `.wasm`, el resto son 320 KiB. |
| 25 MiB de Pages por archivo | No. El `.wasm` los supera en 12,68 MiB. |
| Aviso de GitHub a 50 MiB y bloqueo a 100 MiB | Cabe. Git puede guardar el `.wasm` crudo. Pages no puede publicarlo. |

Comprimir al vuelo no cambia el tope de Pages: el archivo subido sigue siendo el de 37,68 MiB. Si ese archivo se sustituye por su Brotli q11 (6,58 MiB) y el navegador lo descomprime con `Content-Encoding: br`, el guardado y la descarga caben en 25 MiB. Eso no está probado en un preview de Pages de este sitio.

El `.pck` no está en la lista de tipos que Cloudflare comprime. En esta muestra no importa. En una aplicación con arte, el `.pck` viaja del tamaño que tenga en disco, salvo que también se precomprima.

## Hilos y memoria

La sección `memory` del `.wasm` tiene `shared=false` y `memory64=false`. Reserva inicial: 512 páginas, 32 MiB. Máximo declarado: 32 768 páginas, 2 GiB. `index.html` fija `GODOT_THREADS_ENABLED = false`. Las menciones de `SharedArrayBuffer` en `index.js` son la comprobación del motor y solo se exigen si los hilos están activos.

El arranque de abajo ocurrió con `crossOriginIsolated=false` y sin cabeceras COOP ni COEP. La CSP era la del laboratorio más `wasm-unsafe-eval`. No hizo falta `unsafe-eval` para que el motor pintara. `JavaScriptBridge.eval` sí lo pide: la primera sonda falló con `EvalError` y, aun así, el fotograma ya estaba en pantalla. El contrato no debe usar `eval`.

En Chromium, justo después de quitar la capa de carga, `usedJSHeapSize` fue 50 303 483 bytes (48,0 MiB). Chrome cuenta ahí la memoria del wasm. No es la cifra de un iPhone.

## Arranque

Chromium de CI, 2 vCPU, viewport 390×844, `deviceScaleFactor` 2, táctil. Localhost: la red no es la de un móvil. No es Safari ni un iPhone.

| Señal | Valor |
| --- | --- |
| Hasta que Godot retira `#status` (lo que hace `startGame` al terminar) | 1 537 ms |
| Descarga de `index.wasm` en localhost | 307 ms |
| Descarga de `index.js` | 12 ms |
| Descarga de `index.pck` | 38 ms |
| Toque | El texto pasó a «Toques: 1» y el fondo cambió de color |
| Errores de página | Ninguno. Avisos de SwiftShader (`ReadPixels`) |

Los worklets de audio no se pidieron en ese segundo y medio. El primer sonido en un iPhone queda sin medir.

En un teléfono, la descarga del wasm comprimido (unos 7–10 MiB) más la compilación pesan más que estos 1,5 s. El `readyMs` por defecto (8 s) puede quedarse corto. Propongo 20 s para un export de motor, dentro del máximo actual de 60 s, y que lo confirmes en el iPhone antes de publicar el primero.

![Primer fotograma](medida-godot-arranque.png)

![Tras el toque](medida-godot-toque.png)

## D9: dónde vive el wasm

El dueño no compila ni sube el export a mano. Los dos runs costaron unos 10 minutos facturables de `ubuntu-latest` (3 min 27 s y 5 min 27 s de reloj, redondeo hacia arriba). A 0,006 USD el minuto son unos 0,06 USD del cupo de 12 USD al mes del repo privado. La caché de las plantillas (1,22 GiB) evita bajarlas en el segundo run. Ningún secreto.

### (a) Commitear solo lo que quepa en 25 MiB, sin R2

El `.wasm` crudo no cabe: Pages rechazaría el despliegue del sitio entero. El HTML, el JS, el `.pck`, los iconos y los worklets sí caben, y de sobra en los topes de 4 MiB y 16 MiB.

Variante que sí cabe en git y en Pages: sustituir el `.wasm` por su Brotli q11 (6,58 MiB) y servirlo como `application/wasm` con `Content-Encoding: br`. `fetch` descomprime antes de instanciar. Brotli lo entiende Safari en el iPhone desde hace años. No hay secreto ni bucket. El agente commitea la salida; el workflow no hace push con `GITHUB_TOKEN`.

Pendiente de un preview real: que Cloudflare no vuelva a comprimir el cuerpo, y que `pnpm preview` mande la misma cabecera (el laboratorio ya aplica `_headers` en local). Si eso falla, esta variante se descarta.

### (b) El workflow sube el `.wasm` grande a R2

Hace falta porque el crudo supera 25 MiB. Una Function del mismo host lo entrega en streaming al iframe, detrás de Access. El lobby no lo pide si la URL solo vive en el JS del export.

Coste Free: 10 GB-mes, 1 millón de operaciones de escritura y 10 millones de lectura, salida gratis. Un wasm de 38 MiB y un grupo pequeño caben. La CPU de 10 ms de Workers Free no está medida. Un stream que no copia el buffer en el worker no debería gastarla; hay que comprobarlo antes de fiarse.

Seguridad, si más adelante se aprueba: el token lo creas tú, solo Object Read & Write de un bucket, y no viaja por el chat. El job que sube corre en `push` a `main`, con el workflow de `main`, nunca en `pull_request_target` ni en forks. Un PR del mismo repo sí recibe secretos si el job se dispara en `pull_request`: ese job no debe existir. Hacen falta dos buckets, como en D1, para que un preview no escriba en producción. El preview de un PR no tendría el wasm hasta el merge, salvo un environment con tu aprobación.

Más piezas que (a) y un secreto nuevo. Lo dejaría como respaldo.

### (c) Otras vías

- `wasm-opt` no baja de 25 MiB (36,41 MiB). No resuelve Pages.
- Plantilla propia sin 3D: la documentación de Godot habla de cerca de un 15 %. 37,68 × 0,85 sigue en unos 32 MiB. El job de compilar el motor (Emscripten, decenas de minutos, caché grande) no merece la pena como única palanca. Puede sumarse más adelante si quieres un motor más ligero en el teléfono.
- La variante dlink no parte el motor en trozos por debajo de 25 MiB.
- No sirve un artefacto de Actions ni una Release: el navegador no los pide con el origen del laboratorio, y una Release pública se sale de Access.

## Recomendación

Precomprimir con Brotli q11 y commitear el export, sin R2 y sin secreto. Subir el tope por archivo lo justo para ese blob y dejar un margen para un `.pck` ligero. R2 solo si el preview precomprimido falla en Pages o en tu iPhone.

Tope propuesto, a partir de esta medición:

| Tope | Hoy | Propuesto | Por qué |
| --- | ---: | ---: | --- |
| Archivos | 64 | 64 | Se usaron 9. |
| Por archivo | 4 MiB | 12 MiB | El wasm en Brotli q11 pesa 6,58 MiB. 12 MiB deja margen para una versión de Godot algo mayor y para un `.pck` modesto. Sigue siendo un freno móvil: un pack de texturas enorme no pasa. |
| Total | 16 MiB | 32 MiB | El export precomprimido de esta muestra cabe en unos 7 MiB. 32 MiB admite wasm + un `.pck` ligero. Cada archivo sigue teniendo el muro duro de 25 MiB de Pages, que el validador debe comprobar aparte. |
| Aviso / fallo de JS | 1,5 / 4 MiB | Igual | El JS del motor pesa 273 KiB. El `.wasm` no es JS. |

Si prefieres no tocar el total hasta ver una aplicación real, el mínimo que esta medición obliga a cambiar es el por archivo (de 4 a 12 MiB) y servir el wasm precomprimido. El total de 16 MiB aún daría para esta muestra (unos 7 MiB) y se quedaría justo en cuanto el `.pck` pase de unos 9 MiB.

El validador de la aplicación servida (`scripts/app-contract.mjs`) es el sitio del cambio. El puente de assets no interviene: el motor pide el wasm por `fetch`, no por `__protoLabData`.

## La arcade: opción, no requisito

Recomiendo tratar el export como una aplicación de código: la misma máquina, el mismo distintivo de versión, la misma preview y la misma capa «Abriendo…». El cargador ya es así. El catálogo guarda `href`, `version` y `previewHref`. El selector pinta la preview y la versión. Al abrir, el laboratorio pide solo el HTML (`assertPrototypePage`) y luego monta el iframe. El wasm lo pide el `index.js` de ese documento. El service worker no intercepta `/protos/`. En la medición, el wasm aparece como `fetch` de la página del export, no del lobby.

Qué implicaría, si lo apruebas:

- Carpeta `protos/<slug>/` con `proto.json` (`version`, `history`, `preview`, `capabilities: ["wasm"]`, `readyMs` alrededor de 20 000). Sin sala ni mueble nuevos.
- El shell de Godot, en el `then` de `startGame`, llama a `__protoLabNotifyReady`. El cierre usa `engine.requestQuit()`. Sin `JavaScriptBridge.eval`.
- `pnpm previews` genera la misma `preview.webp`. Ese paso sí descarga el wasm; el lobby, no.
- No precargar el wasm desde el mundo ni incrustarlo en el HTML. El `fileSizes` del shell no debe volverse una lista que el laboratorio descargue al entrar en la sala.
- Tu prueba en un iPhone antes de fusionar el primer export.

Alternativas que no recomiendo:

- Una sala o una máquina solo para motores. El wasm seguiría descargándose al abrir, así que no ahorra datos en el lobby, y duplica escena, colisión, e2e y forma de abrir.
- Salir del overlay y abrir el export como documento suelto. También descarga al abrir, y pierde Volver, la capa de arranque y la pantalla completa que ya tiene el laboratorio.

La decisión es tuya.

## Unity, en breve

No lo he exportado. Un tercero publica builds vacíos de Unity 6, ya optimizados, de unos 3,3 MiB (WebGL2 a tamaño mínimo) a unos 7 MiB con URP. El muro de 25 MiB es menos evidente que con la plantilla oficial de Godot, pero esa cifra es de otro sitio y a menudo ya va comprimida.

En CI hace falta licencia: `UNITY_LICENSE`, correo y contraseña, o un serial. La imagen del editor pesa varios GB y gasta más minutos. La web de Unity admite Safari en iOS 15 o posterior, y advierte de que IndexedDB no funciona dentro de un iframe. Aquí las aplicaciones van en un iframe. Los hilos nativos piden COOP y COEP, que este sitio no envía; el C# de Unity en web ya va en un solo hilo.

No lo tomaría como primer motor. Cabe estudiarlo después, con una medición propia y la prueba del iPhone, si de verdad hace falta. Hasta entonces no crearía esos secretos.

## Si lo apruebas, el cambio sería este

No está hecho.

1. Workflow de export, derivado del de esta medición, solo cuando cambia esa aplicación. Caché de plantillas. Sin push con `GITHUB_TOKEN` y sin secretos.
2. Brotli q11 del `.wasm` y `Content-Encoding: br` solo en ese slug, en el ensamblado y en el preview local.
3. `proto.json` con `wasm`, `readyMs`, versión, historial y preview.
4. Aviso `ready` desde el shell, no desde `eval`. `stop()` llama a `requestQuit`.
5. Topes en `scripts/app-contract.mjs` como en la tabla, más un fallo explícito si un archivo supera 25 MiB o si el wasm pide memoria compartida.
6. Nada de escena nueva si aceptas la misma arcade.
7. `pnpm previews` y tu prueba en el iPhone antes del merge.
8. R2, un token mínimo creado por ti y una Function de streaming solo si el paso 2 falla en un preview.

## Preguntas

1. ¿Precomprimimos el wasm con Brotli y lo commiteamos, o prefieres R2 para el archivo crudo?
2. ¿Subo el tope a 12 MiB por archivo y 32 MiB en total, o solo el por archivo y el total se queda en 16 MiB hasta que una aplicación real lo pida?
3. ¿El export va en la misma arcade? Recomiendo que sí.
4. ¿Te vale 20 s de `readyMs` como punto de partida, a confirmar en tu iPhone?
5. El wasm declara hasta 2 GiB de memoria. Hay que ver si el iPhone mata la pestaña. Aquí no se puede medir.
