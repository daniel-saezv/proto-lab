# Plantilla de aplicación

Copia esta carpeta a `protos/<slug>/`. No está en el catálogo ni en el sitio: el laboratorio solo lee `protos/`.

1. Renombra el directorio al slug (`a-z`, números y guiones).
2. En `package.json`, cambia `name` a `@proto-lab/<slug>` (tiene que ser único en el workspace).
3. En `proto.json`, iguala `slug` al directorio y reescribe título, descripción, autor, fecha, etiquetas, versión e historial.
4. `vite.config.ts` toma el `base` del slug del manifiesto.
5. Deja `stop()` en `window.__protoLabApp`. Tiene que cancelar bucles, quitar listeners, cerrar el audio, soltar WebGL y llamar a `revokeAll` del puente.

El contrato con el laboratorio está en `AGENTS.md`.
