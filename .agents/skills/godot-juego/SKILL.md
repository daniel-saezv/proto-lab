---
name: godot-juego
description: "Juego aprobado de Proto Lab en Godot 4.7. La issue marca 3D o 2D; el viewport no obliga a hacer 2D. Incluye cómo comprobar el proyecto con Godot headless en Cursor Cloud, el presupuesto de rendimiento para escritorio y móvil de gama alta, y las fuentes CC0 de las que se puede copiar arte. Úsala al crear o iterar protos/<slug>/godot o al elegir modelos, sprites o audio. No sustituye a proto-lab-app ni al LEEME del export."
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
- `TileMapLayer` entra cuando la issue pide 2D o teselas. La mención de mapas de teselas en `protos/AGENTS.md` es un ejemplo de usar el motor.

El viewport 390×844, `canvas_items` y `expand` son la ventana que exige el validador (`scripts/godot-web.mjs`). Se quedan así. En la guía de [varias resoluciones](https://docs.godotengine.org/en/4.7/tutorials/rendering/multiple_resolutions.html), `canvas_items` deja el 3D a la resolución de la ventana. En vertical, `Camera3D.keep_aspect` queda en `Camera3D.KEEP_WIDTH`.

El renderer sigue en `gl_compatibility`. En la web es el único y [sí pinta juegos 3D](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html), con las funciones 3D básicas. Forward+ y Mobile no salen en el navegador. Sin niebla volumétrica, SDFGI, VoxelGI ni decals. Una luz direccional, ambiente, pocas omni y las sombras apagadas salvo que el juego las necesite. El cielo de partida es `ProceduralSkyMaterial`.

GDScript. Los controles van por toque, y el primer sonido va en ese gesto. El detalle del audio sin hilos está en el `LEEME`. Las mallas van en glTF 2.0 (`.gltf` o `.glb`): el workflow de export no instala Blender. [Formatos 3D](https://docs.godotengine.org/en/4.7/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html).

No reescribas prototipos ya publicados solo por esta skill.

## Comprobar el proyecto sin exportar (Cursor Cloud)

La imagen no trae Godot y el export lo hace el workflow. Para no escribir escenas a ciegas, descarga el binario oficial en `/tmp` durante la sesión (no se commitea, no se añade a la imagen ni a `package.json`) y úsalo en headless antes de cada push:

```bash
curl -sSL -o /tmp/godot.zip https://github.com/godotengine/godot-builds/releases/download/4.7.2-stable/Godot_v4.7.2-stable_linux.x86_64.zip
unzip -oq /tmp/godot.zip -d /tmp && G=/tmp/Godot_v4.7.2-stable_linux.x86_64
cd protos/<slug>/godot
$G --headless --path . --import                                   # importa glb, ogg y texturas; revisa los ERROR de la salida
$G --headless --path . --check-only --script res://ruta/script.gd   # sale con 1 si el GDScript no compila
$G --headless --path . --quit-after 300 2>&1 | grep -E "SCRIPT ERROR|ERROR:" && echo "hay errores"
```

Un error en tiempo de ejecución no cambia el código de salida: por eso el `grep`. En headless no se pinta nada, así que esto valida carga, scripts y lógica, no rendimiento ni aspecto. `.godot/` queda ignorado por el `.gitignore` del proyecto; los `*.import` sí se commitean. El export sigue siendo el del workflow.

## Rendimiento: escritorio y móvil de gama alta

El objetivo es 60 fps estables en un navegador de escritorio y en un móvil de gama alta (Safari en iOS y Chrome en Android), con WebGL 2 (`gl_compatibility`) y **un solo hilo**: la lógica, la física, el audio y el navegador comparten el hilo principal.

El presupuesto decide la técnica, no recorta la propuesta. Si la issue pide algo caro (un mundo grande, muchas luces, mucha gente en pantalla), consíguelo con técnica y explícalo en el PR. No rebajes la idea sin decirlo.

Cifras orientativas por fotograma visible, para un móvil de gama alta: unas 200–300 llamadas de dibujo, del orden de 300 k triángulos, pocas luces dinámicas por objeto y una sola sombra direccional como mucho. En escritorio sobra margen; diseña para el móvil y deja que escritorio lo luzca.

Técnicas, de más a menos rentables:

- **Repetición**: `MultiMeshInstance3D` para todo lo que se repite (hierba, rocas, multitudes, balas). Un material compartido por muchos objetos cuesta menos que muchos materiales parecidos; usa atlas de texturas.
- **Distancia**: `visibility_range_end` en `GeometryInstance3D` para ocultar lo lejano, y la cámara con `far` ajustado. Niebla de profundidad simple para esconder el corte.
- **Luz**: en Compatibility cada omni o spot que toca un objeto añade coste; acota `omni_range` / `spot_range`. La emisión en el material y un ambiente bien elegido sustituyen a muchas luces. Sombras solo en la direccional, con `directional_shadow_max_distance` corto.
- **Resolución**: con `canvas_items` el 3D se pinta a la resolución de la ventana, que en un móvil con densidad 3 son muchos píxeles. `get_viewport().scaling_3d_scale` baja solo el 3D y deja la interfaz nítida (comprueba en la doc 4.7 qué modo de escalado admite Compatibility).
- **Física**: formas simples (caja, esfera, cápsula) para lo que se mueve; `ConcavePolygonShape3D` solo en estático.
- **GDScript**: tipado, nodos cacheados con `@onready`, nada de `get_node`, `find_child` ni creación de objetos en cada `_process`. Reutiliza instancias (pool) en vez de `instantiate()` / `queue_free()` continuos.
- **Tirones**: el primer uso de un material o efecto compila su shader. Muéstralos una vez durante la carga, antes de enviar `ready`, para que no tartamudee al jugar.
- **Partículas y audio**: cantidades contenidas y pocas voces a la vez (ver el audio sin hilos en el `LEEME` del export).

Escalado automático, para no tener que elegir entre arte y fluidez: el juego mide `Performance.get_monitor(Performance.TIME_PROCESS)` o `Engine.get_frames_per_second()` y, si pasa unos segundos por debajo de ~50 fps, baja en este orden `scaling_3d_scale`, sombras y partículas. El arte y el diseño no cambian; solo su coste.

El agente no puede medir en un teléfono. En el PR anota las cifras estimadas (llamadas de dibujo, triángulos, luces, sombra sí o no) y qué hace el escalado automático. La fluidez real la confirma el dueño.

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
2. Elige una fila de la tabla. Desde Cursor Cloud se descarga con `curl` a `/tmp`. Si la fuente solo da un zip (Kenney, Quaternius), descomprímelo en `/tmp` y copia solo los archivos que entran en la escena: glTF o glb para modelos, ogg para audio, texturas de como mucho 1024 px de lado. El zip no se commitea. Sin el all-in-one de Kenney, sin megakits y sin archivos de Patreon. En KayKit, el `raw` de GitHub da el archivo suelto.
3. Déjalos en ese prototipo. En un juego van dentro de `protos/<slug>/godot/`: Godot empaqueta `res://` en el `.pck`. La CSP del sitio (`connect-src 'self'`) no permite pedirlos a otro origen al jugar.
4. En una app que no es juego, los mismos archivos van en la carpeta del prototipo, por donde esa app ya publica imágenes y audio. Siguen los cupos de la app: imagen o audio sueltos a 1,5 MiB, 64 archivos y 32 MiB.
5. Anota `CREDITOS.md` en el prototipo. En un juego, `protos/<slug>/godot/CREDITOS.md`, con nombre, URL, licencia y archivos. En CC0 la atribución no es obligatoria; el archivo es la prueba para quien revisa.
6. El `.pck` publicado sigue en 12 MiB como máximo. Si el archivo no cabe, bájalo de resolución o no lo metas.
7. Pasa `--import` en headless (sección «Comprobar el proyecto sin exportar») para confirmar que cada archivo entra en Godot. No commitees `.godot/`. No hay almacén compartido en el repo: cada prototipo guarda los archivos que usa.
