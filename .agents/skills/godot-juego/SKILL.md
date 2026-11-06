---
name: godot-juego
description: "Juego aprobado de Proto Lab en Godot 4.7. La issue marca 3D o 2D; el viewport no obliga a hacer 2D. También lista las fuentes CC0 de las que se puede copiar arte a un prototipo. Úsala al crear protos/<slug>/godot o al elegir modelos, sprites o audio. No sustituye a proto-lab-app ni al LEEME del export."
---

# Juego Godot en Proto Lab

No hay una skill oficial de Godot. La API de referencia es la documentación **4.7**: [docs.godotengine.org/en/4.7](https://docs.godotengine.org/en/4.7/).

## Quién manda

1. [`.agents/skills/proto-lab-app/SKILL.md`](../proto-lab-app/SKILL.md) y [`templates/export-estatico/LEEME.md`](../../../templates/export-estatico/LEEME.md) mandan en el export, el validador, la ventana, el hilo único, `wasm`, la CSP, el guardado y los cupos.
2. Esta skill manda en la dimensión de la escena y en las fuentes de las que se puede copiar arte.
3. Si una receta y la documentación 4.7 no coinciden, gana la documentación.

No instales packs de skills. Ni [GodotPrompter](https://github.com/jame581/GodotPrompter), ni [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills), ni [gd-agentic-skills](https://github.com/underscor1ng/gd-agentic-skills), ni [Godot-Skill](https://github.com/shihabshahrier/Godot-Skill), ni [godot-skills](https://github.com/grndctrl/godot-skills).

Como lectura, no como skill instalada, GodotPrompter es MIT. El commit fijado es [`d7b26cdb5fae14d4ef7b713c5bf259395e75c3c6`](https://github.com/jame581/GodotPrompter/tree/d7b26cdb5fae14d4ef7b713c5bf259395e75c3c6) (HEAD de `master` consultado el 2026-11-06). Las dos páginas útiles son [`skills/3d-essentials/SKILL.md`](https://github.com/jame581/GodotPrompter/blob/d7b26cdb5fae14d4ef7b713c5bf259395e75c3c6/skills/3d-essentials/SKILL.md) y [`skills/rendering-pipeline/SKILL.md`](https://github.com/jame581/GodotPrompter/blob/d7b26cdb5fae14d4ef7b713c5bf259395e75c3c6/skills/rendering-pipeline/SKILL.md). Ignora lo que ahí pida SDFGI, decals, Forward+, hilos, `JavaScriptBridge.eval`, la PWA de Godot, un export local o guardar la partida en `user://`.

Las skills de Phaser del workspace no se aplican a un juego aprobado.

El agente no exporta en la máquina. El procedimiento sigue en el `LEEME` del export estático.

## Dimensión

La issue marca la dimensión.

- Si pide 3D, perspectiva, modelos o una cámara en el espacio, la escena de juego es `Node3D` con `Camera3D`.
- Cenital describe la cámara. En 3D es una `Camera3D` en perspectiva u ortográfica, mirando hacia abajo.
- `TileMapLayer` entra cuando la issue pide 2D o teselas. La mención de mapas de teselas en `AGENTS.md` es un ejemplo de usar el motor.

El viewport 390×844, `canvas_items` y `expand` son la ventana que exige el validador (`scripts/godot-web.mjs`). Se quedan así. En la guía de [varias resoluciones](https://docs.godotengine.org/en/4.7/tutorials/rendering/multiple_resolutions.html), `canvas_items` deja el 3D a la resolución de la ventana. En vertical, `Camera3D.keep_aspect` queda en `Camera3D.KEEP_WIDTH`.

El renderer sigue en `gl_compatibility`. En la web es el único y [sí pinta juegos 3D](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html), con las funciones 3D básicas. Forward+ y Mobile no salen en el navegador. Sin niebla volumétrica, SDFGI, VoxelGI ni decals. Una luz direccional, ambiente, pocas omni y las sombras apagadas salvo que el juego las necesite. El cielo de partida es `ProceduralSkyMaterial`.

GDScript. Los controles van por toque, y el primer sonido va en ese gesto. El detalle del audio sin hilos está en el `LEEME`. Las mallas van en glTF 2.0 (`.gltf` o `.glb`): el workflow de export no instala Blender. [Formatos 3D](https://docs.godotengine.org/en/4.7/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html).

No reescribas prototipos ya publicados solo por esta skill.

## Arte que se puede copiar

«Sin licencia» aquí quiere decir CC0 o dominio público: el archivo se puede copiar al prototipo y redistribuir en el repo. Al copiar, abre la ficha y comprueba que sigue diciendo CC0. Si ya no lo dice, no lo uses.

| Fuente | Dónde mirar | Licencia |
| --- | --- | --- |
| Kenney | [kenney.nl/assets](https://kenney.nl/assets), [kenney.nl/support](https://kenney.nl/support) | CC0 en las fichas de assets. El logo del estudio no entra. |
| Quaternius | [quaternius.com](https://quaternius.com/) | CC0 escrito en la ficha de cada pack. La descarga pública a menudo es solo una parte del pack. |
| KayKit | [github.com/KayKit-Game-Assets](https://github.com/KayKit-Game-Assets) | CC0. Cada pack es un repo: lee su `LICENSE.txt`. |
| ambientCG | [ambientcg.com](https://ambientcg.com/), [licencia](https://docs.ambientcg.com/license/) | CC0. Texturas pesadas: como mucho 1024 px de lado. |
| Poly Haven | [polyhaven.com](https://polyhaven.com/), [licencia](https://polyhaven.com/license) | CC0 de los assets. El resto del sitio no. Como mucho 1024 px; el cielo procedural va antes que un HDRI. |

Quedan fuera OpenGameArt, Poly Pizza, la Asset Library de Godot, itch.io genérico, Sketchfab, Pixabay, Mixkit y los bundles Sonniss.

1. Prueba antes una malla primitiva, un CSG o un color.
2. Elige una fila de la tabla. Descarga solo los archivos que entran en la escena: glTF o glb para modelos, ogg para audio, texturas de como mucho 1024 px de lado. Sin zips, sin el all-in-one de Kenney, sin megakits y sin archivos de Patreon.
3. Déjalos en ese prototipo. En un juego van dentro de `protos/<slug>/godot/`: Godot empaqueta `res://` en el `.pck`. La CSP del sitio (`connect-src 'self'`) no permite pedirlos a otro origen al jugar.
4. En una app que no es juego, los mismos archivos van en la carpeta del prototipo, por donde esa app ya publica imágenes y audio. Siguen los cupos de la app: imagen o audio sueltos a 1,5 MiB, 64 archivos y 32 MiB.
5. Anota `CREDITOS.md` en el prototipo. En un juego, `protos/<slug>/godot/CREDITOS.md`, con nombre, URL, licencia y archivos. En CC0 la atribución no es obligatoria; el archivo es la prueba para quien revisa.
6. El `.pck` publicado sigue en 12 MiB como máximo. Si el archivo no cabe, bájalo de resolución o no lo metas.
7. No commitees `.godot/`. No hay almacén compartido en el repo: cada prototipo guarda los archivos que usa.
