# Plantilla de código

Copia esta carpeta a `protos/<slug>/`. No está en el catálogo ni en el sitio: el laboratorio solo lee `protos/`.

1. Renombra el directorio al slug (`a-z`, números y guiones).
2. En `package.json`, cambia `name` a `@proto-lab/<slug>` (tiene que ser único en el workspace).
3. En `proto.json`, iguala `slug` al directorio y reescribe título, descripción, autor, fecha, etiquetas, versión e historial. `readyMs` es el plazo de arranque, en milisegundos. `permissions`, si hace falta, solo puede listar `camera`, `microphone`, `geolocation`, `accelerometer`, `gyroscope` y `magnetometer`.
4. `vite.config.ts` toma el `base` del slug del manifiesto.
5. Al pintar el primer fotograma, avisa con `postLabSignal("ready", parent)`. Al cargar el script, avisa `alive`.
6. Deja `stop()` en `window.__protoLabApp`. Tiene que cancelar bucles, quitar listeners, cerrar el audio y soltar WebGL (`loseContext`).

No uses `window.__protoLabAssets` ni `revokeAll`: el laboratorio ya no incrusta ese puente. Los archivos de la propia carpeta se piden por URL, mismo origen.

El contrato con el laboratorio está en `AGENTS.md`.
