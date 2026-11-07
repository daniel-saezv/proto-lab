---
name: proto-lab-app
description: "Contrato de una aplicación de Proto Lab dentro del iframe del laboratorio. Úsala al crear o iterar protos/<slug>, proto.json, capabilities, el puente __protoLabData, un export Godot o el chequeo móvil. Gana a las skills de Phaser en loader, escenas y audio por URL."
---

# Aplicación de Proto Lab

El contrato vive en [`protos/AGENTS.md`](../../../protos/AGENTS.md) y manda sobre esta skill y sobre las skills de Phaser (loader, escenas y audio por URL). Léelo entero antes de tocar `protos/<slug>/`. Aquí no se repiten cifras: si dudas de un cupo, está allí.

Si es un juego, sigue además [`.agents/skills/godot-juego/SKILL.md`](../godot-juego/SKILL.md).

## Lista de comprobación antes del PR

- [ ] Solo cambia `protos/<slug>/` (y `pnpm-lock.yaml` si hay dependencias nuevas).
- [ ] `proto.json` válido; en una iteración, `version` subida y su entrada en `history`.
- [ ] `capabilities` solo con valores de la lista cerrada; `wasm` si hay WebAssembly (Godot incluido).
- [ ] `alive` al cargar, `ready` con el primer fotograma visible, `readyMs` adecuado.
- [ ] `window.__protoLabApp.stop()` suelta bucles, listeners, audio y WebGL, y llama a `__protoLabData.revoke()`; también en `pagehide`.
- [ ] Recursos por `window.__protoLabData` con ruta relativa; nada de `localStorage`, `sessionStorage`, hilos ni navegar la ventana superior.
- [ ] Meta viewport `width=device-width` y `touch-action: none`; diseño que vale en móvil y en escritorio, sin ramas por agente de usuario.
- [ ] Juego en Godot: comprobación headless limpia y export descargado del workflow (procedimiento en `templates/export-estatico/LEEME.md`).
- [ ] `pnpm typecheck`, `pnpm test:unit` y `pnpm build` en verde (el build pasa `scripts/app-budget.mjs`).
- [ ] `pnpm previews` ejecutado y `preview.webp`, `preview.mp4` y `preview-src.sha256` commiteados.
- [ ] PR con la plantilla, el número de la issue en el cuerpo y las convenciones de commits del `AGENTS.md` raíz.
