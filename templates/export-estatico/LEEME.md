# Plantilla de export estático

Para un build ya hecho (Godot u otro motor), sin Vite y sin `package.json`. No es una plantilla por motor: el mismo shell vale para cualquier HTML que ya sepa arrancar solo.

1. Crea `protos/<slug>/` con el export (su `index.html` y el resto de archivos).
2. Añade `proto.json` (puedes partir del de esta carpeta). El `slug` tiene que coincidir con el directorio.
3. Copia `arranque.js` junto al `index.html` del export e inclúyelo con un script clásico, antes del motor:

```html
<script src="./arranque.js"></script>
```

4. Cuando el primer fotograma se vea, llama a `window.__protoLabNotifyReady()`. Si no, el laboratorio corta el arranque al cabo de `readyMs` y no da por buena una pantalla en blanco.
5. Registra el cierre del motor:

```js
window.__protoLabApp.onStop(function () {
  // cancela el bucle del motor, cierra el audio y suelta WebGL
});
```

`window.__protoLabApp.stop()` ejecuta esos ganchos y revoca las URL de objeto. El laboratorio lo llama y después navega el iframe a `about:blank`.

`arranque.js` también deja `window.__protoLabData` para archivos propios y para el guardado de una persona. El guardado solo llega si `proto.json` declara `save` en `capabilities`:

```js
window.__protoLabData.json("datos/nota.json").then(function (nota) {});
window.__protoLabData.blobUrl("media/sprite.png").then(function (url) {});
window.__protoLabData.set("partida", JSON.stringify({ nivel: 1 }));
window.__protoLabData.get("partida").then(function (cruda) {});
window.__protoLabData.remove("partida");
window.__protoLabData.sharedSet("mesa", "norte");
window.__protoLabData.sharedGet("mesa").then(function (puesta) {});
window.__protoLabData.sharedRemove("mesa");
window.__protoLabData.query("top10", {}).then(function (mejores) {});
```

Las rutas son relativas y tienen que quedarse dentro de `/protos/<slug>/`. Entran imágenes, audio y JSON. Cupo por apertura: 64 rutas, 4 MiB por archivo, 16 MiB en total y 128 peticiones. El guardado de una persona vive en `localStorage` del laboratorio (`proto-lab:app:<slug>`): 32 claves, 32 KiB por valor y 256 KiB por slug. Los datos compartidos (`sharedGet`, `sharedSet`, `sharedRemove`) usan el mismo cupo y solo responden si `proto.json` declara `shared`. `query(nombre, params)` ejecuta una consulta de `db/queries.json` y solo responde si `capabilities` incluye `tables`. El export no usa `localStorage` ni `sessionStorage` por su cuenta, ni sondea esas APIs. Cómo crear, cambiar y borrar tablas está en `docs/contrato-tablas.md`.

La carpeta no necesita `package.json`. El build del laboratorio copia los archivos tal cual, salvo `proto.json`, `godot/`, `db/`, `node_modules`, `dist` y los dotfiles. El validador de la aplicación servida aplica: 64 archivos, 12 MiB por archivo, 32 MiB en total y un fallo duro a los 25 MiB de Cloudflare Pages. El aviso de JS sigue en 1,5 MiB y el fallo de JS en 4 MiB.

Para instanciar WebAssembly, añade `"wasm"` a `capabilities`. El ensamblado pone `wasm-unsafe-eval` en la CSP de `/protos/<slug>/` y en ningún otro sitio. Sigue sin hilos y sin `SharedArrayBuffer`: no hay COOP ni COEP. Los formularios no se envían (`form-action 'none'`). Los permisos de dispositivo (`camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope`, `magnetometer`) rellenan el atributo `allow` del iframe y la `Permissions-Policy` de este slug. `permissions` sigue valiendo como lista de esos dispositivos.

## Godot 4 en la web

Sirve para un export de Godot 4.7 en un solo hilo. La guía de Godot es [Exporting for the Web](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html) y la página del shell, [Custom HTML page for Web export](https://docs.godotengine.org/en/4.7/tutorials/platform/web/customizing_html5_shell.html). El renderer de la web es Compatibility (WebGL 2). Forward+ y Mobile no salen en el navegador.

1. El proyecto vive en `protos/<slug>/godot/` (`project.godot`, `export_presets.cfg`, escenas). No se publica.
2. Copia `godot-shell.html` de esta plantilla a `protos/<slug>/godot/shell.html`. El preset apunta a `html/custom_html_shell="shell.html"`.
3. En el preset: `variant/thread_support=false`, `variant/extensions_support=false`, PWA apagada y `ensure_cross_origin_isolation_headers=false`. Sin eso el wasm pide memoria compartida y el laboratorio no tiene COOP ni COEP.
4. Texturas para móvil: `textures/vram_compression/import_etc2_astc=true` en el proyecto y `vram_texture_compression/for_mobile=true` en el preset. `for_desktop` se deja en false: activarlo guarda otra copia de cada textura. Godot descomprime ETC2/ASTC si el dispositivo no las tiene en hardware.
5. Viewport de teléfono (390×844), estirado `canvas_items` con aspecto `expand`, orientación vertical y `pointing/emulate_touch_from_mouse=true`. Los controles van por `InputEventScreenTouch`. El shell lleva `touch-action: none` y el canvas ocupa el iframe (`canvas_resize_policy` 2).
6. `proto.json`: `"capabilities": ["wasm"]`, `"readyMs": 20000`, versión, historial y `preview`. 20 s es el plazo de arranque de Godot hasta que el dueño lo confirme en el iPhone.
7. Copia `arranque.js` junto al `index.html` publicado. El shell lo carga antes del motor, avisa `ready` en el `then` de `startGame` y registra `engine.requestQuit()` en `onStop`. No uses `JavaScriptBridge.eval`: la CSP no tiene `unsafe-eval`.
8. El `.wasm` publicado es Brotli q11 con el mismo nombre (`index.wasm`). El ensamblado manda `Content-Type: application/wasm` y `Content-Encoding: br`. El navegador lo descomprime al pedirlo. No lo subas en claro si pasa de 25 MiB: Pages rechaza el archivo.
9. El workflow `.github/workflows/exportar-godot.yml` exporta en CI cuando el pull request toca `protos/<slug>/godot/`. No corre en push a `main` ni en un horario. Comprueba que lo publicado coincide y no hace push. `.github/workflows/medir-godot.yml` solo se lanza a mano.

El audio web, desde Godot 4.3, usa muestras (Sample) cuando no hay hilos: poca latencia, sin efectos ni audio posicional fiable. El navegador no suena hasta un gesto. Arranca el motor al abrir (así el wasm se descarga al entrar, no al primer toque) y reproduce el primer sonido dentro de `_input` con el toque. No hace falta `eval`. Hay un fallo abierto de Safari en iOS si se disparan muchas muestras seguidas durante mucho rato ([godot#116750](https://github.com/godotengine/godot/issues/116750)); pruébalo en el iPhone antes de darlo por bueno.

La pantalla de carga del laboratorio tapa el `#status` de Godot hasta `ready`. El shell reenvía `onProgress` (bytes ya bajados y total; si el total es 0, Godot no conoce el tamaño y el arco sigue indeterminado). No añadas otra imagen de carga: el laboratorio no usa archivos ni fuentes para esa capa.

No actives la PWA de Godot. Su service worker cachea el export sin invalidar y puede enseñar una versión vieja ([el aviso está en la propia guía](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html)). El service worker del laboratorio no intercepta `/protos/`.

`user://` de Godot guarda en IndexedDB. En un iframe del mismo origen puede funcionar; en navegación privada y, según la guía, si el navegador trata las cookies del iframe como de terceros, no. Para un dato que tenga que quedar, usa la capacidad `save` del laboratorio. Esta plantilla no puentea IndexedDB.

Una plantilla de exportación compilada a medida (módulos apagados, `optimize=size_extra`) baja el wasm, pero hay que compilar Godot con Emscripten. No se hace aquí: son muchos minutos de Actions y el dueño no compila el motor en su ordenador. La guía está en [Optimizing a build for size](https://docs.godotengine.org/en/stable/engine_details/development/compiling/optimizing_for_size.html). Si más adelante hace falta, es una decisión del dueño.
