---
name: godot-juego
description: "Juego aprobado de Proto Lab en Godot 4.7. La issue marca 3D o 2D; el viewport no obliga a hacer 2D. Incluye cómo comprobar el proyecto con Godot headless en Cursor Cloud, el presupuesto de rendimiento para escritorio y móvil de gama alta, pautas de gráficos ricos 2D y 3D en Compatibility, de interfaz rica, enlaces a la documentación 4.7 y a los demos oficiales, y las fuentes CC0 de las que se puede copiar arte. Úsala al crear o iterar protos/<slug>/godot o al elegir modelos, sprites o audio. No sustituye a proto-lab-app ni al LEEME del export."
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

El renderer sigue en `gl_compatibility`. En la web es el único y [sí pinta juegos 3D](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html). Qué efectos tiene y cómo sustituir los que faltan está en la sección «Gráficos ricos». El cielo de partida es `ProceduralSkyMaterial`.

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

Cifras orientativas por fotograma visible, para un móvil de gama alta: unas 200–300 llamadas de dibujo, del orden de 300 k triángulos, pocas luces dinámicas por objeto y la sombra direccional como base. En escritorio sobra margen; diseña para el móvil y deja que escritorio lo luzca.

Técnicas, de más a menos rentables:

- **Repetición**: `MultiMeshInstance3D` para todo lo que se repite (hierba, rocas, multitudes, balas). Un material compartido por muchos objetos cuesta menos que muchos materiales parecidos; usa atlas de texturas.
- **Distancia**: `visibility_range_end` en `GeometryInstance3D` para ocultar lo lejano, y la cámara con `far` ajustado. Niebla de profundidad simple para esconder el corte.
- **Luz**: Compatibility pinta en una sola pasada y admite 8 omni y 8 spot por malla; cada luz con sombra añade otra pasada. Acota `omni_range` / `spot_range` para que cada malla toque pocas. La emisión en el material y un ambiente bien elegido sustituyen a muchas luces. La sombra base es la direccional, con `directional_shadow_max_distance` corto; omni o spot con sombra son el escalón caro de «Gráficos ricos».
- **Resolución**: con `canvas_items` el 3D se pinta a la resolución de la ventana, que en un móvil con densidad 3 son muchos píxeles. `get_viewport().scaling_3d_scale` baja solo el 3D y deja la interfaz nítida. En Compatibility el único modo es el bilineal (FSR no está).
- **Física**: formas simples (caja, esfera, cápsula) para lo que se mueve; `ConcavePolygonShape3D` solo en estático.
- **GDScript**: tipado, nodos cacheados con `@onready`, nada de `get_node`, `find_child` ni creación de objetos en cada `_process`. Reutiliza instancias (pool) en vez de `instantiate()` / `queue_free()` continuos.
- **Tirones**: el primer uso de un material o efecto compila su shader. Muéstralos una vez durante la carga, antes de enviar `ready`, para que no tartamudee al jugar.
- **Partículas y audio**: cantidades contenidas y pocas voces a la vez (ver el audio sin hilos en el `LEEME` del export).

Escalado automático, para no tener que elegir entre arte y fluidez: el juego mide `Performance.get_monitor(Performance.TIME_PROCESS)` o `Engine.get_frames_per_second()` y, si pasa unos segundos por debajo de ~50 fps, baja en este orden `scaling_3d_scale`, sombras y partículas. El arte y el diseño no cambian; solo su coste.

El agente no puede medir en un teléfono. En el PR anota las cifras estimadas (llamadas de dibujo, triángulos, luces, sombra sí o no) y qué hace el escalado automático. La fluidez real la confirma el dueño.

## Gráficos ricos (2D y 3D) en la web

El juego tiene que verse bien, no solo funcionar. La riqueza sale de la dirección de arte (paleta, luz, contraste, silueta), del movimiento y de los efectos bien elegidos, no de la técnica más cara. El estilo lo marca la issue; si no dice nada, elige uno coherente y mantenlo en todo el juego.

Lo que Compatibility (WebGL 2) **sí** tiene en 4.7, según la [tabla oficial de renderers](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html):

- `WorldEnvironment`: tonemap, glow, ajustes de color (brillo, contraste, saturación, LUT), niebla de profundidad y de altura, SSAO y cielo procedural o con shader.
- Luces: direccional, omni y spot con sombras, 8 omni y 8 spot por malla, y 2 `ReflectionProbe` por malla.
- `StandardMaterial3D` completo salvo dispersión subsuperficial: mapas de normales, emisión, rim, transparencia, `BaseMaterial3D` sin sombreado y toon.
- Shaders propios: `spatial`, `canvas_item`, `sky` y `particles`, con texturas de pantalla y de profundidad. Posproceso propio con un quad a pantalla completa.
- `GPUParticles3D/2D`, MSAA en 3D y supermuestreo (`scaling_3d_scale` > 1).
- 2D: `PointLight2D` y `DirectionalLight2D` con mapas de normales, sombras con `LightOccluder2D`, `CanvasModulate`, `Parallax2D` y todo `canvas_item`.

Lo que **no** tiene, y con qué se consigue el mismo efecto:

| Falta | Alternativa |
| --- | --- |
| Profundidad de campo | Shader de posproceso con la textura de profundidad, o fondo más borroso en el propio arte |
| Decals | `Sprite3D` o quad con alpha pegado a la superficie, o máscara en el shader del suelo |
| Niebla volumétrica, SDFGI, VoxelGI, SSIL | Niebla de altura, rayos de luz como mallas aditivas, color de vértice o ambiente horneado en textura; emisión para el rebote |
| Reflejos en pantalla (SSR) | `ReflectionProbe` o un cubemap en el material |
| FXAA, TAA, SMAA, MSAA en 2D | MSAA 3D; en 2D, la propiedad `antialiased` de líneas y polígonos o bordes suaves en la textura |
| Estelas de partículas | Malla tipo cinta actualizada por script, o partículas más densas |
| Debanding, HDR (color RGBA8) | Ruido o *dither* en el shader de degradados; el glow se ajusta pensando en rango bajo |

`LightmapGI` pinta lightmaps ya horneados, pero hornearlos necesita una GPU con RenderingDevice y el agente solo tiene headless: no lo uses salvo que el dueño entregue el horneado.

Un nivel de calidad por coste, no por plataforma. El juego arranca en alto y baja solo con el escalado automático de la sección de rendimiento; no hay ramas por navegador ni sistema.

| Coste | Efectos | Si el fotograma no llega |
| --- | --- | --- |
| Barato, siempre | Tonemap, ajustes de color, niebla, emisión, materiales toon o sin sombreado, `canvas_item`, luces 2D | — |
| Medio | Glow, sombra direccional, MSAA 2×, partículas densas, posproceso de un paso | Bajar resolución de sombra, menos partículas |
| Caro | SSAO, MSAA 4×, varias luces con sombra, supermuestreo | Es lo primero que se apaga |

En 3D, los mapas de normales, la emisión y una buena luz direccional con glow suave dan más que muchas luces. En 2D, las luces con mapas de normales, la paralaje por capas y los shaders `canvas_item` (contorno, disolución, distorsión, destellos) hacen el trabajo de un render caro.

## Interfaz rica

Una interfaz cuidada es parte del juego, no un extra. Lo que hace que se vea bien en 390×844 y en escritorio:

- Un `Theme` del proyecto (`gui/theme/custom`) con colores, `StyleBoxFlat` (esquinas, bordes, sombras) y variaciones de tipo, en vez de estilos sueltos en cada nodo.
- `Container` y anclajes para que el `expand` de la ventana reparta el espacio sola en vertical y en apaisado. Nada de posiciones fijas en píxeles.
- Fuentes MSDF para texto nítido a cualquier escala (`gui/theme/default_font_multichannel_signed_distance_field`, o la opción de importación de cada fuente); el texto 3D con `Label3D`.
- Movimiento: `Tween` para entradas, pulsaciones y números que suben; `AnimationPlayer` para secuencias. Shaders `canvas_item` y partículas 2D para brillo, destellos y transiciones.
- Toque: botones grandes y separados, respuesta visual en la pulsación y foco navegable (`focus_neighbor_*`) para teclado y mando en escritorio.
- `RichTextLabel` con BBCode para diálogos y textos con efectos.

El arte de interfaz (botones, paneles, iconos, fuentes) sale de la tabla CC0 de abajo: Kenney tiene packs de interfaz y de fuentes.

## Referencias (enlaces, no se copian al repo)

No hay skill oficial de Godot (la organización `godotengine` no publica ninguna). Las referencias son la documentación 4.7 y los demos oficiales. Se leen; no se clonan en el repositorio ni se instalan como skill. Si `docs.godotengine.org` no responde, la misma página está en [`godot-docs` rama 4.7](https://github.com/godotengine/godot-docs/tree/4.7) como `.rst`.

Documentación 4.7, interfaz:
[índice de UI](https://docs.godotengine.org/en/4.7/tutorials/ui/index.html) ·
[contenedores](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_containers.html) ·
[tamaño y anclajes](https://docs.godotengine.org/en/4.7/tutorials/ui/size_and_anchors.html) ·
[temas](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_skinning.html) ·
[editor de temas](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_using_theme_editor.html) ·
[variaciones de tipo](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_theme_type_variations.html) ·
[fuentes](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_using_fonts.html) ·
[BBCode](https://docs.godotengine.org/en/4.7/tutorials/ui/bbcode_in_richtextlabel.html) ·
[navegación por foco](https://docs.godotengine.org/en/4.7/tutorials/ui/gui_navigation.html) ·
[controles propios](https://docs.godotengine.org/en/4.7/tutorials/ui/custom_gui_controls.html) ·
[varias resoluciones](https://docs.godotengine.org/en/4.7/tutorials/rendering/multiple_resolutions.html)

Documentación 4.7, movimiento y efectos:
[animación](https://docs.godotengine.org/en/4.7/tutorials/animation/introduction.html) ·
[`Tween`](https://docs.godotengine.org/en/4.7/classes/class_tween.html) ·
[primer shader 2D](https://docs.godotengine.org/en/4.7/tutorials/shaders/your_first_shader/your_first_2d_shader.html) ·
[shader `canvas_item`](https://docs.godotengine.org/en/4.7/tutorials/shaders/shader_reference/canvas_item_shader.html) ·
[partículas 2D](https://docs.godotengine.org/en/4.7/tutorials/2d/particle_systems_2d.html) ·
[luces 2D](https://docs.godotengine.org/en/4.7/tutorials/2d/2d_lights_and_shadows.html) ·
[antialias 2D](https://docs.godotengine.org/en/4.7/tutorials/2d/2d_antialiasing.html) ·
[texto 3D](https://docs.godotengine.org/en/4.7/tutorials/3d/3d_text.html) ·
[ejemplos de entrada](https://docs.godotengine.org/en/4.7/tutorials/inputs/input_examples.html)

Documentación 4.7, gráficos:
[entorno y posproceso](https://docs.godotengine.org/en/4.7/tutorials/3d/environment_and_post_processing.html) ·
[`StandardMaterial3D`](https://docs.godotengine.org/en/4.7/tutorials/3d/standard_material_3d.html) ·
[luces y sombras 3D](https://docs.godotengine.org/en/4.7/tutorials/3d/lights_and_shadows.html) ·
[antialias 3D](https://docs.godotengine.org/en/4.7/tutorials/3d/3d_antialiasing.html) ·
[partículas 3D](https://docs.godotengine.org/en/4.7/tutorials/3d/particles/index.html) ·
[iluminación global](https://docs.godotengine.org/en/4.7/tutorials/3d/global_illumination/index.html) ·
[shaders](https://docs.godotengine.org/en/4.7/tutorials/shaders/index.html) ·
[posproceso propio](https://docs.godotengine.org/en/4.7/tutorials/shaders/custom_postprocessing.html) ·
[visual shaders](https://docs.godotengine.org/en/4.7/tutorials/shaders/visual_shaders.html) ·
[paralaje 2D](https://docs.godotengine.org/en/4.7/tutorials/2d/2d_parallax.html)

Documentación 4.7, web y rendimiento:
[web](https://docs.godotengine.org/en/4.7/tutorials/platform/web/index.html) ·
[renderers](https://docs.godotengine.org/en/4.7/tutorials/rendering/renderers.html) (la tabla dice qué existe en Compatibility) ·
[rendimiento](https://docs.godotengine.org/en/4.7/tutorials/performance/index.html) ·
[optimización general](https://docs.godotengine.org/en/4.7/tutorials/performance/general_optimization.html) ·
[MultiMesh](https://docs.godotengine.org/en/4.7/tutorials/performance/using_multimesh.html) ·
[rangos de visibilidad](https://docs.godotengine.org/en/4.7/tutorials/3d/visibility_ranges.html) ·
[escalado de resolución](https://docs.godotengine.org/en/4.7/tutorials/3d/resolution_scaling.html) ·
[guía de estilo GDScript](https://docs.godotengine.org/en/4.7/tutorials/scripting/gdscript/gdscript_styleguide.html) ·
[buenas prácticas](https://docs.godotengine.org/en/4.7/tutorials/best_practices/index.html)

Demos oficiales, MIT, en el commit fijado [`b761b4cd`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1) (el `project.godot` declara 4.7 y `gl_compatibility`; consultado el 2026-11-07):

| Para | Demos |
| --- | --- |
| Interfaz | [`gui/control_gallery`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/gui/control_gallery), [`gui/theming_override`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/gui/theming_override), [`gui/rich_text_bbcode`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/gui/rich_text_bbcode), [`gui/msdf_font`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/gui/msdf_font), [`gui/multiple_resolutions`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/gui/multiple_resolutions), [`gui/drag_and_drop`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/gui/drag_and_drop) |
| Movimiento y efectos 2D | [`2d/tween`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/tween), [`2d/particles`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/particles), [`2d/sprite_shaders`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/sprite_shaders), [`2d/screen_space_shaders`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/screen_space_shaders) |
| Gráficos 2D (Compatibility) | [`2d/lights_and_shadows`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/lights_and_shadows), [`2d/light2d_as_mask`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/light2d_as_mask), [`2d/bullet_shower`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/bullet_shower), [`2d/instancing`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/instancing), [`2d/platformer`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/platformer) |
| Gráficos 3D (Forward+: lee la técnica y comprueba la tabla) | [`3d/lights_and_shadows`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/lights_and_shadows), [`3d/tonemap_color_correction`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/tonemap_color_correction), [`3d/material_testers`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/material_testers), [`3d/sky_shaders`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/sky_shaders), [`3d/particles`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/particles), [`3d/procedural_materials`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/procedural_materials), [`3d/antialiasing`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/antialiasing), [`3d/platformer`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/platformer) |
| Juegos completos pequeños | [`2d/dodge_the_creeps`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/2d/dodge_the_creeps), [`3d/squash_the_creeps`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/squash_the_creeps) |
| 3D y rendimiento | [`3d/labels_and_texts`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/labels_and_texts), [`3d/visibility_ranges`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/visibility_ranges), [`3d/occlusion_culling_mesh_lod`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/occlusion_culling_mesh_lod), [`3d/graphics_settings`](https://github.com/godotengine/godot-demo-projects/tree/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/3d/graphics_settings) (ajustes de calidad en el juego) |

Cómo usarlos desde Cursor Cloud: lee un archivo con `curl -sL https://raw.githubusercontent.com/godotengine/godot-demo-projects/b761b4cd5718a7118f2c95eb55f181d0a5f004f1/<ruta>` o descarga una carpeta a `/tmp`, nunca dentro del repo. Algunos demos usan funciones de Forward+: antes de copiar una técnica, mira en la tabla de renderers que exista en Compatibility. Se puede adaptar código; si un archivo queda casi igual, anótalo en `CREDITOS.md` con la licencia MIT. El arte de los demos no se copia: el arte sale de la tabla de abajo.

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
