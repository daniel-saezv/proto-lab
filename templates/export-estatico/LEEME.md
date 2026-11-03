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
```

Las rutas son relativas y tienen que quedarse dentro de `/protos/<slug>/`. Entran imágenes, audio y JSON. Cupo por apertura: 64 rutas, 4 MiB por archivo, 16 MiB en total y 128 peticiones. El guardado vive en `localStorage` del laboratorio (`proto-lab:app:<slug>`): 32 claves, 32 KiB por valor y 256 KiB por slug. El export no usa `localStorage` ni `sessionStorage` por su cuenta.

La carpeta no necesita `package.json`. El build del laboratorio copia los archivos tal cual. El validador de la aplicación servida sigue aplicando: 64 archivos, 4 MiB por archivo, 16 MiB en total, aviso de JS a 1,5 MiB y fallo a 4 MiB.

Para instanciar WebAssembly, añade `"wasm"` a `capabilities`. El ensamblado pone `wasm-unsafe-eval` en la CSP de `/protos/<slug>/` y en ningún otro sitio. Sigue sin hilos y sin `SharedArrayBuffer`: no hay COOP ni COEP. Los formularios no se envían (`form-action 'none'`). Los permisos de dispositivo (`camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope`, `magnetometer`) solo rellenan el atributo `allow` del iframe. `permissions` sigue valiendo como lista de esos dispositivos.
