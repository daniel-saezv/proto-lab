# Plantilla de código

Copia esta carpeta a `protos/<slug>/`. No está en el catálogo ni en el sitio: el laboratorio solo lee `protos/`.

1. Renombra el directorio al slug (`a-z`, números y guiones).
2. En `package.json`, cambia `name` a `@proto-lab/<slug>` (tiene que ser único en el workspace).
3. En `proto.json`, iguala `slug` al directorio y reescribe título, descripción, autor, fecha, etiquetas, versión e historial. `readyMs` es el plazo de arranque, en milisegundos. `capabilities`, si hace falta, solo puede listar `save`, `wasm`, `shared`, `tables`, `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope` y `magnetometer`. Esta plantilla declara `save`. `wasm` añade `wasm-unsafe-eval` a la CSP de este slug. `shared` abre `sharedGet`, `sharedSet` y `sharedRemove`. `tables` abre `query` y exige `db/` (ver `docs/contrato-tablas.md`). Los permisos de dispositivo rellenan el atributo `allow` del iframe y la `Permissions-Policy` de `/protos/<slug>/` (`(self)` solo para los declarados). `save`, `wasm`, `shared` y `tables` no entran en `allow`.
4. `vite.config.ts` toma el `base` del slug del manifiesto.
5. Al pintar el primer fotograma, avisa con `postLabSignal("ready", parent)`. Al cargar el script, avisa `alive`. Si la descarga es larga, puedes avisar `{ source: "proto-lab", type: "progress", loaded, total }` con bytes. Sin `total` mayor que 0 el laboratorio deja el indicador indeterminado.
6. Deja `stop()` en `window.__protoLabApp`. Tiene que cancelar bucles, quitar listeners, cerrar el audio, soltar WebGL (`loseContext`) y llamar a `window.__protoLabData.revoke()`.
7. Al crear o cambiar la aplicación, ejecuta `pnpm previews` y commitea `preview.webp`, `preview.mp4` y `preview-src.sha256`. La foto queda en 640×360 (16:9); lo importante va en el centro 16:10. La CI comprueba el clip y no lo graba.

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

El puente de datos (`load`, `json`, `blobUrl`) admite 64 rutas, 4 MiB por archivo, 16 MiB en total y 128 peticiones por apertura. La segunda lectura de la misma ruta reutiliza la caché de esa apertura. Eso no es el tamaño de la aplicación servida: el build falla si lo publicado pasa de 64 archivos, 12 MiB por archivo o 32 MiB en total, y también si un archivo pasa de 25 MiB (tope de Cloudflare Pages). Un JS de más de 1,5 MiB avisa y uno de más de 4 MiB falla. Una imagen o un audio servidos fallan a 1,5 MiB; el wasm y el pck siguen en 12 MiB. Cupo de guardado por slug, local o compartido: 32 claves, 64 caracteres por clave, 32 KiB por valor y 256 KiB en total. La clave solo admite letras, números, punto, guion y guion bajo.

La aplicación es móvil primero, y móvil primero no es un solo teléfono: vale para el móvil en general y para escritorio, con soluciones web estándar. No hay ramas por agente de usuario salvo para textos de ayuda. Un parche de un solo motor solo si es imprescindible, aislado y justificado en un comentario del código. El HTML servido lleva `<meta name="viewport" content="width=device-width, …">` y `touch-action: none` en el documento o en el canvas (esta plantilla ya los trae). El chequeo está en `scripts/app-budget.mjs` y falla el build, dentro de `verificar`. No hay un smoke por aplicación: la fluidez en un teléfono real la confirma el dueño. Antes de las skills de Phaser, lee `.agents/skills/proto-lab-app/SKILL.md`.

El contrato con el laboratorio está en `AGENTS.md`. Workers AI lo usa solo el taller del Inventor; esta aplicación no lo declara ni lo llama. R2, Durable Objects e Images no están activos: el detalle está en `docs/tecnologias-bajo-demanda.md`.
