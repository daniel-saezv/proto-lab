# Plantilla de código

Copia esta carpeta a `protos/<slug>/`. No está en el catálogo ni en el sitio: el laboratorio solo lee `protos/`.

1. Renombra el directorio al slug (`a-z`, números y guiones).
2. En `package.json`, cambia `name` a `@proto-lab/<slug>` (tiene que ser único en el workspace).
3. En `proto.json`, iguala `slug` al directorio y reescribe título, descripción, autor, fecha, etiquetas, versión e historial. `readyMs` es el plazo de arranque, en milisegundos. `capabilities`, si hace falta, solo puede listar `save`, `wasm`, `shared`, `tables`, `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope` y `magnetometer`. Esta plantilla declara `save`. `wasm` añade `wasm-unsafe-eval` a la CSP de este slug. `shared` abre `sharedGet`, `sharedSet` y `sharedRemove`. `tables` abre `query` y exige `db/` (ver `docs/contrato-tablas.md`). Los permisos de dispositivo rellenan el atributo `allow` del iframe y la `Permissions-Policy` de `/protos/<slug>/` (`(self)` solo para los declarados). `save`, `wasm`, `shared` y `tables` no entran en `allow`.
4. `vite.config.ts` toma el `base` del slug del manifiesto.
5. Al pintar el primer fotograma, avisa con `postLabSignal("ready", parent)`. Al cargar el script, avisa `alive`. Si la descarga es larga, puedes avisar `{ source: "proto-lab", type: "progress", loaded, total }` con bytes. Sin `total` mayor que 0 el laboratorio deja el indicador indeterminado.
6. Deja `stop()` en `window.__protoLabApp`. Tiene que cancelar bucles, quitar listeners, cerrar el audio, soltar WebGL (`loseContext`) y llamar a `window.__protoLabData.revoke()`.

Los archivos propios (imagen, audio o JSON) se piden por ruta relativa, dentro de `/protos/<slug>/`, con `window.__protoLabData`. El guardado de una persona va a `localStorage` del laboratorio, en la bolsa `proto-lab:app:<slug>`, solo si `capabilities` incluye `save`. Sin esa capacidad el laboratorio ignora el mensaje. La aplicación no lee ni escribe `localStorage` ni `sessionStorage` por su cuenta. No hay hilos ni `SharedArrayBuffer` (el sitio no envía COOP ni COEP). Los formularios no se envían (`form-action 'none'`).

```ts
const nota = await window.__protoLabData.json("datos/nota.json");
const sprite = await window.__protoLabData.blobUrl("media/sprite.png");
const beep = await window.__protoLabData.load("media/beep.wav");
await window.__protoLabData.set("partida", JSON.stringify({ nivel: 1 }));
const cruda = await window.__protoLabData.get("partida");
await window.__protoLabData.remove("partida");
await window.__protoLabData.sharedSet("mesa", "norte");
const puesta = await window.__protoLabData.sharedGet("mesa");
await window.__protoLabData.sharedRemove("mesa");
const mejores = await window.__protoLabData.query("top10", {});
await window.__protoLabData.query("guardarPuntuacion", { nombre: "ada", puntos: 10 });
```

`load` devuelve `{ mime, buffer }`. `json` devuelve el valor. `blobUrl` devuelve una URL de objeto para una imagen o un audio. `get` devuelve un string o `null`. `set` y `remove` guardan y borran una clave de esa persona. `sharedGet`, `sharedSet` y `sharedRemove` hacen lo mismo con un dato que ven todas las sesiones, y solo si `proto.json` declara `shared`. `query` ejecuta una consulta declarada en `db/queries.json` y solo responde si `capabilities` incluye `tables`. El valor compartido es un string: si hace falta un objeto, se serializa antes. Los parámetros de `query` son string, número o `null`. No sondees: cada llamada compartida o cada consulta es una petición.

Cupo de archivos por apertura: 64 rutas, 4 MiB por archivo, 16 MiB en total y 128 peticiones. La segunda lectura de la misma ruta reutiliza la caché de esa apertura. Cupo de guardado por slug, local o compartido: 32 claves, 64 caracteres por clave, 32 KiB por valor y 256 KiB en total. La clave solo admite letras, números, punto, guion y guion bajo.

El contrato con el laboratorio está en `AGENTS.md`.
