# Tiza sobre pizarra

Recortes cortos para el trazo del tablón. No forman parte de la música del lobby.

- Archivos: `chalk-1.m4a`, `chalk-2.m4a`, `chalk-3.m4a`
- Obra: «CHALKBOARD WRITING SOUND EFFECT»
- Canal: YOUTUBE THING (@youtubething9665)
- Fuente: https://youtu.be/JiupbhgGIu0
- Licencia: el vídeo no declara una licencia explícita. La descripción no menciona CC0, CC-BY ni una cesión de derechos, y la ficha de YouTube no marca la reutilización como permitida. Se usa por decisión del propietario del repositorio (@daniel-saezv), bajo su responsabilidad.

La toma dura unos 5,7 s. Casi todo son golpes secos: un solo impacto de menos de 20 ms concentra la energía (picos en 0,8 s, 1,3 s, 1,8 s, 2,3 s, 2,7 s, 2,9 s, 3,1 s, 3,3 s, 3,8 s, 4,1 s, 4,3 s y 5,0 s). Esos no se han recortado. Tampoco un pasaje cerca del ruido de fondo (hacia 4,7 s), porque al normalizarlo subiría el soplido.

Se quedan tres gestos en los que la forma de onda tiene ataque, cuerpo y suelta, y el agudo de la tiza se mantiene en vez de caer como la cola de un golpe:

- `chalk-1.m4a` (0,51–0,64 s de la toma, ~0,13 s). Roce que crece en unas decenas de milisegundos, se sostiene y se apaga. La cresta es ~5 y el tramo más fuerte no se lleva la energía: es un trazo, no un clic.
- `chalk-2.m4a` (3,31–3,66 s, ~0,35 s). El único pasaje de escritura seguida. Empieza justo después del golpe de 3,27 s, que queda fuera. La tiza se levanta unos 30 ms hacia la mitad y vuelve a apoyar; la energía sube y baja, no decae como reverberación.
- `chalk-3.m4a` (5,41–5,55 s, ~0,14 s). Arrastre agudo y estable, con el centroide por encima de 5 kHz durante todo el cuerpo. El clic de 5,38 s queda fuera.

Otro candidato, un pinchazo brillante hacia 1,59 s, se descartó: el 77 % de su energía cabe en 20 ms, así que suena a golpe corto y no a trazo completo.

Cada archivo es mono, AAC-LC a 64 kb/s y 44,1 kHz, con un fundido de entrada y de salida. El pico de los tres queda cerca de −3 dB para que suenen al mismo nivel. La app los pide juntos solo tras un gesto, elige uno al azar sin repetir el anterior, los reproduce a volumen bajo y no apila dos a la vez. Con la música silenciada, o en `?e2e=1`, no se descargan ni suenan.
